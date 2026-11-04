import { ConfigurationFailure, sameIntent } from '../extraction/configuration.js';
import type { IAlertRouter } from '../notifications/contracts.js';
import type { IConfigurationPipeline } from '../extraction/configuration.js';
import { assertExecutionLease } from '../queues/executionLease.js';
import { randomUUID } from 'crypto';
import { DomainError, NotFoundError, CompilerValidationError } from '../errors/domainErrors.js';
import type { IStorageProvider } from '../providers/storage/index.js';
import type { IJobScheduler } from '../queues/scheduler.interface.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import { ChangeStatus, ExtractionQuality, JobStatus, RunStatus } from '../types/enums.js';
import { computeExtractionHash } from '../utils/diffHasher.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { logger } from '../utils/logger.js';
import { buildChangeAlert } from '../utils/changeAlertHelper.js';
import { uploadScreenshotIfEligible } from '../utils/screenshotHelper.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';
import type { RealtimeService } from './realtimeService.js';

export interface CompilationServiceDeps {
  jobRepository: IJobRepository;
  configurationPipeline: IConfigurationPipeline;
  alertRouter: IAlertRouter;
  jobScheduler: IJobScheduler;
  storageProvider: IStorageProvider;
  sessionRepository?: ISessionRepository;
  realtimeService?: RealtimeService;
}

export class CompilationService {
  private readonly jobRepository: IJobRepository;
  private readonly configurationPipeline: IConfigurationPipeline;
  private readonly alertRouter: IAlertRouter;
  private readonly jobScheduler: IJobScheduler;
  private readonly storageProvider: IStorageProvider;
  private readonly sessionRepository?: ISessionRepository;
  private readonly realtimeService?: RealtimeService;

  constructor(deps: CompilationServiceDeps) {
    this.jobRepository = deps.jobRepository;
    this.configurationPipeline = deps.configurationPipeline;
    this.alertRouter = deps.alertRouter;
    this.jobScheduler = deps.jobScheduler;
    this.storageProvider = deps.storageProvider;
    this.sessionRepository = deps.sessionRepository;
    this.realtimeService = deps.realtimeService;
  }

  async compileJob(jobId: string, reason?: string): Promise<ScrapingJobEntity> {
    const startTime = Date.now();
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new NotFoundError(`Scraping job not found: ${jobId}`);
    }

    if (
      job.status === JobStatus.Paused ||
      (reason !== undefined && job.status === JobStatus.Active && job.extractionPlan)
    )
      return job;

    let httpStatus: number | null = null;

    try {
      logger.info('Starting AI extractor compilation', {
        jobId: job.id,
        provider: 'configuration-pipeline',
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

      const configured = await this.configurationPipeline.configure({
        jobId: job.id,
        url: job.url,
        prompt: job.userPrompt,
        intent: job.extractionPlan?.intent,
        semanticPolicy: job.semanticPolicy ?? undefined,
        storageState,
        captureScreenshot: job.captureScreenshotOnChange,
      });
      const compiledSchema = configured.plan;
      if (job.extractionPlan && !sameIntent(job.extractionPlan.intent, compiledSchema.intent))
        throw new CompilerValidationError(
          'Recovery cannot change extraction intent. Review the monitor instructions.'
        );
      logger.info('Extraction semantic review completed', {
        jobId: job.id,
        status: configured.semanticReview.status,
        score: configured.semanticReview.score,
      });
      const execution = {
        data: configured.execution.data,
        report: configured.execution.report,
        scrape: {
          httpStatus: configured.execution.snapshot.httpStatus,
          screenshot: configured.execution.snapshot.screenshot
            ? Buffer.from(configured.execution.snapshot.screenshot)
            : undefined,
        },
      };
      httpStatus = execution.scrape.httpStatus;
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
      const candidate = job.extractionPlan
        ? await this.jobRepository.findLatestSuccessfulRun(job.id)
        : null;
      const previousRun = candidate?.contractRevision === contractRevision ? candidate : null;

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

      const alert =
        hasChanges === ChangeStatus.Changed && previousRun
          ? buildChangeAlert({
              job,
              currentData: smokeTest.extractedData,
              previousData: previousRun.extractedData,
              triggerRules: compiledSchema.intent.triggerRules,
              triggerMatchMode: compiledSchema.intent.triggerMatchMode,
              subjectSuffix: ' (Self-healing)',
            })
          : null;
      const deliveries = alert ? await this.alertRouter.prepare(alert) : [];

      const planRevision = randomUUID();
      execution.report.planRevision = planRevision;
      const repeatableKey = await this.jobScheduler.scheduleRepeatableJob(
        job.id,
        job.cronExpression
      );
      await this.jobRepository.commitRun(
        {
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
        },
        deliveries,
        {
          extractionPlan: compiledSchema,
          planRevision,
          contractRevision,
          status: JobStatus.Active,
          lastError: null,
          failureCount: 0,
          bullmqRepeatableKey: repeatableKey,
        },
        job.updatedAt
      );
      const updatedJob = await this.jobRepository.findById(job.id);

      logger.info('Job compilation and smoke-test succeeded; job is now ACTIVE', {
        jobId: job.id,
        durationMs,
        provider: 'configuration-pipeline',
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
        extractionReport:
          error instanceof ConfigurationFailure
            ? {
                quality: ExtractionQuality.Invalid,
                scope: job.extractionPlan?.intent.scope ?? 'page',
                pagesVisited: 0,
                issues: [userMessage],
                sourcesUsed: {},
                trace: error.trace,
                semanticReview: error.semanticReview,
              }
            : undefined,
        normalizedHash: null,
        hasChanges: ChangeStatus.Unchanged,
        status: RunStatus.Failed,
        errorMessage: userMessage,
        httpStatus,
        durationMs,
      });

      await this.jobRepository.updateJob(job.id, {
        status: job.extractionPlan ? JobStatus.Active : JobStatus.Failed,
        lastError: userMessage,
      });

      await this.realtimeService?.notifyJobUpdated(
        job.userId,
        job.id,
        job.extractionPlan ? JobStatus.Active : JobStatus.Failed
      );

      throw error;
    }
  }
}
