import { assertExecutionLease } from '../queues/executionLease.js';
import { randomUUID } from 'crypto';
import { CompilerValidationError, DomainError, NotFoundError } from '../errors/domainErrors.js';
import type { ICompilerProvider } from '../providers/compilers/compiler.interface.js';
import type { INotificationProvider } from '../providers/notifications/notification.interface.js';
import type { IScraperEngine } from '../providers/scraping/scraper.interface.js';
import { createStorageProvider, type IStorageProvider } from '../providers/storage/index.js';
import type { IJobScheduler } from '../queues/scheduler.interface.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import {
  ChangeStatus,
  ExtractionQuality,
  isAcceptedExtractionQuality,
  JobStatus,
  RunStatus,
} from '../types/enums.js';
import { computeExtractionHash } from '../utils/diffHasher.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { PlanExecutionService } from './planExecutionService.js';
import { extractionPlanSchema, type ExtractionPlan } from '../types/extractionPlan.js';
import { env } from '../config/env.js';
import { buildCompilerEvidence } from '../utils/compilerEvidence.js';
import { logger } from '../utils/logger.js';
import { evaluateAndDispatchChangeAlert } from '../utils/changeAlertHelper.js';
import { uploadScreenshotIfEligible } from '../utils/screenshotHelper.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';
import type { RealtimeService } from './realtimeService.js';

export interface CompilationServiceDeps {
  jobRepository: IJobRepository;
  scraperEngine: IScraperEngine;
  compilerProvider: ICompilerProvider;
  notificationProvider: INotificationProvider;
  jobScheduler: IJobScheduler;
  storageProvider?: IStorageProvider;
  sessionRepository?: ISessionRepository;
  realtimeService?: RealtimeService;
}

export class CompilationService {
  private readonly jobRepository: IJobRepository;
  private readonly scraperEngine: IScraperEngine;
  private readonly compilerProvider: ICompilerProvider;
  private readonly notificationProvider: INotificationProvider;
  private readonly jobScheduler: IJobScheduler;
  private readonly storageProvider: IStorageProvider;
  private readonly sessionRepository?: ISessionRepository;
  private readonly realtimeService?: RealtimeService;

  constructor(deps: CompilationServiceDeps) {
    this.jobRepository = deps.jobRepository;
    this.scraperEngine = deps.scraperEngine;
    this.compilerProvider = deps.compilerProvider;
    this.notificationProvider = deps.notificationProvider;
    this.jobScheduler = deps.jobScheduler;
    this.storageProvider = deps.storageProvider ?? createStorageProvider();
    this.sessionRepository = deps.sessionRepository;
    this.realtimeService = deps.realtimeService;
  }

  async compileJob(jobId: string): Promise<ScrapingJobEntity> {
    const startTime = Date.now();
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new NotFoundError(`Scraping job not found: ${jobId}`);
    }

    let httpStatus: number | null = null;

    try {
      logger.info('Starting AI extractor compilation', {
        jobId: job.id,
        provider: this.compilerProvider.name,
      });

      const storageState = await resolveSessionStorageState(
        this.sessionRepository,
        job.userId,
        job.url,
        {
          jobId: job.id,
          logAction: 'Using authenticated web session for AI compilation',
        }
      );

      // 1. Fetch raw HTML from target URL
      const scrapeResult = await this.scraperEngine.fetchHtml(job.url, {
        storageState,
        waitForSelector: 'main, article, [role="main"], h1',
        captureScreenshot: job.captureScreenshotOnChange,
      });
      httpStatus = scrapeResult.httpStatus;

      // 2. Sanitize DOM and prune repeated sibling nodes before forwarding to AI
      const sanitizedHtml = buildCompilerEvidence(
        scrapeResult.rawHtml,
        env.COMPILATION_MAX_EVIDENCE_CHARS
      );

      let feedback = '';
      let compiledSchema: ExtractionPlan | undefined;
      let execution;
      for (let attempt = 0; attempt < env.COMPILATION_MAX_ATTEMPTS; attempt++) {
        if (Date.now() - startTime >= env.COMPILATION_BUDGET_MS) break;
        try {
          compiledSchema = extractionPlanSchema.parse(
            await this.compilerProvider.compile({
              jobId: job.id,
              timeoutMs: Math.max(1, env.COMPILATION_BUDGET_MS - (Date.now() - startTime)),
              sanitizedHtml: sanitizedHtml,
              userPrompt: `${job.userPrompt}\nTarget URL: ${job.url}\nValidation feedback: ${feedback || 'None'}\nEvidence may be sampled or truncated.`,
            })
          );
          if (job.extractionPlan && job.status === JobStatus.Healing) {
            const contract = (plan: ExtractionPlan) =>
              JSON.stringify({
                fields: Object.entries(plan!.fields).map(([name, field]) => [
                  name,
                  field.type,
                  field.required,
                ]),
                identity: plan!.identityFields,
                rules: plan!.triggerRules,
                mode: plan!.triggerMatchMode,
                scope: plan!.scope,
              });
            if (contract(job.extractionPlan) !== contract(compiledSchema))
              throw new CompilerValidationError(
                'Recovery changed the extraction intent. Review the monitor instructions.'
              );
          }
          execution = await new PlanExecutionService(this.scraperEngine).execute(
            job.url,
            compiledSchema,
            {
              storageState,
              captureScreenshot: job.captureScreenshotOnChange,
              timeoutMs: Math.max(1, env.COMPILATION_BUDGET_MS - (Date.now() - startTime)),
            }
          );
          if (!isAcceptedExtractionQuality(execution.report.quality))
            throw new CompilerValidationError(execution.report.issues.join(' '));
          if (execution.report.quality === ExtractionQuality.Empty && !job.extractionPlan)
            throw new CompilerValidationError(
              'Initial empty collection cannot validate the requested field sources. Retry when records are available.'
            );
          break;
        } catch (error) {
          execution = undefined;
          feedback = error instanceof Error ? error.message : 'Compilation validation failed.';
        }
      }
      if (!execution || !compiledSchema)
        throw new CompilerValidationError(feedback || 'Compilation budget exhausted.');
      const smokeTest = { extractedData: execution.data };
      await assertExecutionLease();
      const latest = await this.jobRepository.findById(job.id);
      if (
        !latest ||
        latest.status === JobStatus.Paused ||
        latest.updatedAt.getTime() !== job.updatedAt.getTime()
      )
        return latest ?? job;

      const contractRevision = job.extractionPlan
        ? (job.contractRevision ?? randomUUID())
        : randomUUID();
      // 5. Compute hash and record initial/healing snapshot
      const normalizedHash = computeExtractionHash(smokeTest.extractedData);
      const previousRun = job.extractionPlan
        ? await this.jobRepository.findLatestSuccessfulRun(job.id)
        : null;

      let hasChanges: ChangeStatus = ChangeStatus.Initial;
      if (previousRun) {
        hasChanges =
          previousRun.normalizedHash === normalizedHash
            ? ChangeStatus.Unchanged
            : ChangeStatus.Changed;
      }

      const screenshotUrl = await uploadScreenshotIfEligible({
        jobId: job.id,
        captureScreenshotOnChange: job.captureScreenshotOnChange,
        hasChanges,
        screenshot: execution.scrape.screenshot,
        storageProvider: this.storageProvider,
        logContext: 'compilation',
      });

      const durationMs = Date.now() - startTime;

      await this.jobRepository.createRun({
        jobId: job.id,
        extractedData: smokeTest.extractedData,
        normalizedHash,
        hasChanges,
        status: RunStatus.Success,
        extractionReport: execution.report,
        contractRevision,
        httpStatus,
        durationMs,
        screenshotUrl,
      });

      if (hasChanges === ChangeStatus.Changed && previousRun) {
        await evaluateAndDispatchChangeAlert({
          job,
          currentData: smokeTest.extractedData,
          previousData: previousRun.extractedData,
          triggerRules: compiledSchema.triggerRules,
          triggerMatchMode: compiledSchema.triggerMatchMode,
          notificationProvider: this.notificationProvider,
          subjectSuffix: ' (Self-healing)',
        });
      }

      // 6. Schedule repeatable job in BullMQ and activate job
      const repeatableKey = await this.jobScheduler.scheduleRepeatableJob(
        job.id,
        job.cronExpression
      );

      const updatedJob = await this.jobRepository.updateJob(job.id, {
        extractionPlan: compiledSchema,
        contractRevision,
        status: JobStatus.Active,
        lastError: null,
        failureCount: 0,
        bullmqRepeatableKey: repeatableKey,
      });

      logger.info('Job compilation and smoke-test succeeded; job is now ACTIVE', {
        jobId: job.id,
        durationMs,
        provider: this.compilerProvider.name,
      });

      await this.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Active);

      return updatedJob ?? job;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      const errorStack = error instanceof Error ? (error.stack ?? errorMessage) : errorMessage;
      const errorCode = error instanceof DomainError ? error.code : 'COMPILATION_ERROR';

      logger.error('Job compilation failed', {
        jobId: job.id,
        durationMs,
        errorCode,
        httpStatus: httpStatus ?? undefined,
        errorStack,
      });

      await assertExecutionLease();
      const current = await this.jobRepository.findById(job.id);
      if (
        !current ||
        current.status === JobStatus.Paused ||
        current.updatedAt.getTime() !== job.updatedAt.getTime()
      )
        return current ?? job;
      const userMessage = formatUserErrorMessage(error);

      await this.jobRepository.createRun({
        jobId: job.id,
        extractedData: null,
        normalizedHash: null,
        hasChanges: ChangeStatus.Unchanged,
        status: RunStatus.Failed,
        errorMessage: userMessage,
        httpStatus,
        durationMs,
      });

      await this.jobRepository.updateJob(job.id, {
        status: JobStatus.Failed,
        lastError: userMessage,
      });

      await this.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Failed);

      throw error;
    }
  }
}
