import { SuccessfulRunService } from './successfulRunService.js';
import { snapshotToScrapeResult } from '../extraction/scrapeResultMapper.js';
import { ConfigurationFailure, sameIntent } from '../extraction/configuration.js';
import type { IAlertRouter } from '../notifications/contracts.js';
import type { IConfigurationPipeline } from '../extraction/configuration.js';
import { assertExecutionLease } from '../queues/executionLease.js';
import { randomUUID } from 'crypto';
import {
  CompilerApiRequestError,
  DomainError,
  NotFoundError,
  CompilerValidationError,
} from '../errors/domainErrors.js';
import type { IStorageProvider } from '../providers/storage/index.js';
import type { IJobScheduler } from '../queues/scheduler.interface.js';
import { CompilationReason } from '../queues/scheduler.interface.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import { ChangeStatus, ExtractionQuality, JobStatus, RunStatus } from '../types/enums.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { logger } from '../utils/logger.js';
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
  constructor(private readonly deps: CompilationServiceDeps) {}

  async compileJob(
    jobId: string,
    reason?: CompilationReason,
    willRetry = false
  ): Promise<ScrapingJobEntity> {
    const startTime = Date.now();
    const job = await this.deps.jobRepository.findById(jobId);

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
        this.deps.sessionRepository,
        job.userId,
        job.url,
        {
          jobId: job.id,
          logAction: 'Using authenticated web session for AI compilation',
        }
      );

      const configured = await this.deps.configurationPipeline.configure({
        jobId: job.id,
        url: job.url,
        prompt: job.userPrompt,
        intent: job.extractionPlan?.intent,
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
        scrape: snapshotToScrapeResult(
          configured.execution.snapshot,
          configured.execution.durationMs
        ),
      };
      httpStatus = execution.scrape.httpStatus;
      await assertExecutionLease();
      const latest = await this.deps.jobRepository.findById(job.id);
      if (
        !latest ||
        latest.status === JobStatus.Paused ||
        latest.updatedAt.getTime() !== job.updatedAt.getTime()
      )
        return latest ?? job;

      const contractRevision = job.extractionPlan
        ? (job.contractRevision ?? randomUUID())
        : randomUUID();
      const planRevision = randomUUID();
      const prepared = await new SuccessfulRunService(this.deps).prepare({
        job,
        plan: compiledSchema,
        execution,
        contractRevision,
        startedAt: startTime,
        logContext: 'compilation',
        subjectSuffix: ' (Self-healing)',
      });
      const durationMs = prepared.run.durationMs ?? undefined;
      const repeatableKey = await this.deps.jobScheduler.scheduleRepeatableJob(
        job.id,
        job.cronExpression
      );
      await this.deps.jobRepository.commitRun(
        prepared.run,
        prepared.deliveries,
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
      const updatedJob = await this.deps.jobRepository.findById(job.id);

      logger.info('Job compilation and smoke-test succeeded; job is now ACTIVE', {
        jobId: job.id,
        durationMs,
        provider: 'configuration-pipeline',
      });

      await this.deps.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Active);

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
      const current = await this.deps.jobRepository.findById(job.id);
      if (
        !current ||
        current.status === JobStatus.Paused ||
        current.updatedAt.getTime() !== job.updatedAt.getTime()
      )
        return current ?? job;
      const userMessage = formatUserErrorMessage(error);

      await this.deps.jobRepository.createRun({
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

      const retryableHealingFailure =
        reason === CompilationReason.Healing && error instanceof DomainError && error.isRetryable;
      const failureStatus =
        reason === CompilationReason.Healing
          ? retryableHealingFailure
            ? JobStatus.Healing
            : JobStatus.Failed
          : willRetry && error instanceof CompilerApiRequestError && error.statusCode === 429
            ? JobStatus.PendingCompilation
            : job.extractionPlan
              ? JobStatus.Active
              : JobStatus.Failed;
      await this.deps.jobRepository.updateJob(job.id, {
        status: failureStatus,
        lastError: userMessage,
      });

      if (reason === CompilationReason.Healing && !retryableHealingFailure) {
        await this.deps.jobScheduler.removeRepeatableJob(job.id, job.bullmqRepeatableKey);
      }

      await this.deps.realtimeService?.notifyJobUpdated(job.userId, job.id, failureStatus);

      throw error;
    }
  }
}
