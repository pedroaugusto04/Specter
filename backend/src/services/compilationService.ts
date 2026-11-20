import { env } from '../config/env.js';
import type { JobRunEntity } from '../types/domain.js';
import { SuccessfulRunService } from './successfulRunService.js';
import { snapshotToScrapeResult } from '../extraction/scrapeResultMapper.js';
import { ConfigurationFailure } from '../extraction/configurationFailure.js';
import { sameIntent } from '../extraction/configurationPolicy.js';
import type { IAlertRouter } from '../notifications/contracts.js';
import type { IConfigurationPipeline } from '../extraction/configuration.js';
import { assertExecutionLease } from '../queues/executionLease.js';
import { randomUUID } from 'crypto';
import {
  CompilerApiRequestError,
  DomainError,
  NotFoundError,
  CompilerValidationError,
  QuotaExceededError,
} from '../errors/domainErrors.js';
import type { IStorageProvider } from '../providers/storage/index.js';
import type { IJobScheduler } from '../queues/scheduler.interface.js';
import { CompilationReason } from '../queues/scheduler.interface.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import {
  ChangeStatus,
  ExtractionQuality,
  JobStatus,
  RunStatus,
  isAcceptedExtractionQuality,
} from '../types/enums.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { logger } from '../utils/logger.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';
import type { RealtimeService } from './realtimeService.js';
import type { IUserRepository } from '../repositories/userRepository.js';
import type { QuotaService } from './quotaService.js';
import type { ICompilationControl } from './compilationControl.interface.js';

function compilationFailureStatus(input: {
  willRetry: boolean;
  hasExistingPlan: boolean;
  error: unknown;
}): JobStatus {
  const { willRetry, hasExistingPlan, error } = input;
  if (willRetry && error instanceof CompilerApiRequestError && error.statusCode === 429)
    return JobStatus.PendingCompilation;
  return hasExistingPlan ? JobStatus.Active : JobStatus.Failed;
}

export interface CompilationServiceDeps {
  jobRepository: IJobRepository;
  userRepository: Pick<IUserRepository, 'findById'>;
  configurationPipeline: IConfigurationPipeline;
  alertRouter: IAlertRouter;
  jobScheduler: IJobScheduler;
  storageProvider: IStorageProvider;
  sessionRepository: ISessionRepository;
  realtimeService: RealtimeService;
  quotaService: QuotaService;
}

export class CompilationService implements ICompilationControl {
  private readonly activeCompilations = new Map<string, AbortController>();

  constructor(private readonly deps: CompilationServiceDeps) {}

  cancelCompilation(jobId: string, reason?: string): boolean {
    const controller = this.activeCompilations.get(jobId);
    if (controller && !controller.signal.aborted) {
      logger.info('Cancelling active compilation task', { jobId, reason });
      controller.abort(new Error(reason ?? 'Compilation cancelled by user'));
      return true;
    }
    return false;
  }

  async compileJob(
    jobId: string,
    reason?: CompilationReason,
    willRetry = false,
    runId?: string
  ): Promise<ScrapingJobEntity> {
    const existingController = this.activeCompilations.get(jobId);
    if (existingController && !existingController.signal.aborted) {
      const current = await this.deps.jobRepository.findById(jobId);
      if (!current) throw new NotFoundError(`Scraping job not found: ${jobId}`);
      return current;
    }

    const abortController = new AbortController();
    this.activeCompilations.set(jobId, abortController);
    try {
      return await this.runCompilation(jobId, reason, willRetry, abortController, runId);
    } finally {
      if (this.activeCompilations.get(jobId) === abortController) {
        this.activeCompilations.delete(jobId);
      }
    }
  }

  private async runCompilation(
    jobId: string,
    reason: CompilationReason | undefined,
    willRetry: boolean,
    abortController: AbortController,
    runId?: string
  ): Promise<ScrapingJobEntity> {
    const startTime = Date.now();
    const job = await this.deps.jobRepository.findById(jobId);

    if (!job) {
      throw new NotFoundError(`Scraping job not found: ${jobId}`);
    }

    if (reason === CompilationReason.Recovery && !runId)
      throw new Error('Recovery compilation must be attached to an execution run.');
    if (runId && reason !== CompilationReason.Recovery)
      throw new Error('Execution run IDs are only valid for recovery compilations.');

    let run = runId ? await this.deps.jobRepository.findRun(runId) : null;
    if (runId && (!run || run.jobId !== job.id || run.status !== RunStatus.Running)) return job;
    if (run && run.monitorUpdatedAt?.getTime() !== job.updatedAt.getTime()) {
      await this.deps.jobRepository.cancelRuns(job.id);
      return job;
    }
    if (run) {
      const metadata = run.metadata!;
      if (
        metadata.compilationAttempts >= env.COMPILATION_QUEUE_MAX_ATTEMPTS ||
        Date.now() - run.startedAt!.getTime() > env.RUN_MAX_DURATION_MS
      ) {
        await this.failRecovery(job, run);
        return job;
      }
      metadata.compilationAttempts++;
      willRetry = willRetry && metadata.compilationAttempts < env.COMPILATION_QUEUE_MAX_ATTEMPTS;
      run = await this.deps.jobRepository.commitRun(
        { ...run, metadata },
        [],
        undefined,
        job.updatedAt
      );
    }

    if (
      job.status === JobStatus.Paused ||
      (reason !== undefined && job.status === JobStatus.Active && job.extractionPlan)
    )
      return job;

    if (job.userId) {
      try {
        await this.deps.quotaService.assertCanCompile(job.userId);
      } catch (quotaErr) {
        if (abortController.signal.aborted) {
          return (await this.deps.jobRepository.findById(job.id)) ?? job;
        }
        if (quotaErr instanceof QuotaExceededError) {
          logger.warn('Skipping compilation: monthly compilation quota reached', {
            jobId: job.id,
            userId: job.userId,
            reason,
          });
          if (reason === CompilationReason.Recovery) {
            if (!run)
              throw new Error('Recovery compilation has no active execution run.', {
                cause: quotaErr,
              });
            await this.failRecovery(job, run);
            return job;
          }
          throw quotaErr;
        }
        throw quotaErr;
      }
    }

    const currentJob = await this.deps.jobRepository.findById(job.id);
    if (!currentJob) throw new NotFoundError(`Scraping job not found: ${job.id}`);
    if (
      abortController.signal.aborted ||
      currentJob.status === JobStatus.Paused ||
      (reason !== undefined && currentJob.status === JobStatus.Active && currentJob.extractionPlan)
    ) {
      return currentJob;
    }

    let httpStatus: number | null = null;

    try {
      logger.info('Starting AI extractor compilation', {
        jobId: job.id,
        provider: 'configuration-pipeline',
      });

      const owner = await this.deps.userRepository.findById(job.userId);
      const pageLanguage = owner?.pageLanguage ?? owner?.browserPageLanguage ?? undefined;
      const storageState = await resolveSessionStorageState(
        this.deps.sessionRepository,
        job.userId,
        job.url,
        {
          jobId: job.id,
          logAction: 'Using authenticated web session for AI compilation',
        }
      );
      abortController.signal.throwIfAborted();

      const failure = run?.extractionReport;
      const configured = await this.deps.configurationPipeline.configure({
        jobId: job.id,
        url: job.url,
        prompt: job.userPrompt,
        intent: job.extractionPlan?.intent,
        recovery: failure
          ? {
              failure: {
                failureCode: failure.failureCode,
                failureReason: failure.failureReason,
                quality: failure.quality,
                issues: failure.issues?.slice(0, 8) ?? [],
                evidence: failure.evidence?.slice(0, 8),
              },
              previousStrategy: job.extractionPlan?.strategy,
            }
          : undefined,
        storageState,
        pageLanguage,
        captureScreenshot: job.captureScreenshotOnChange,
        signal: abortController.signal,
      });
      abortController.signal.throwIfAborted();
      if (!isAcceptedExtractionQuality(configured.execution.report.quality))
        throw new CompilerValidationError('Recovery output did not pass extraction validation.');
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
        startedAt: run?.startedAt?.getTime() ?? startTime,
        logContext: 'compilation',
      });
      const durationMs = prepared.run.durationMs ?? 0;
      const repeatableKey = await this.deps.jobScheduler.scheduleRepeatableJob(
        job.id,
        job.cronExpression
      );
      const completedRun = await this.deps.jobRepository.commitRun(
        {
          ...prepared.run,
          id: run?.id,
          recoveredAutomatically: Boolean(run),
          chargeUsage: 'compilation',
        },
        prepared.deliveries,
        {
          extractionPlan: compiledSchema,
          planRevision,
          contractRevision,
          status: JobStatus.Active,
          lastError: null,
          bullmqRepeatableKey: repeatableKey,
        },
        job.updatedAt
      );
      const updatedJob = await this.deps.jobRepository.findById(job.id);

      await this.deps.realtimeService.notifyJobRunCompleted(
        job.userId,
        job.id,
        completedRun.id,
        completedRun.hasChanges
      );

      logger.info('Job compilation and smoke-test succeeded; job is now ACTIVE', {
        jobId: job.id,
        durationMs,
        provider: 'configuration-pipeline',
      });

      await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id, JobStatus.Active);

      return updatedJob ?? job;
    } catch (error) {
      if (
        abortController.signal.aborted ||
        (error instanceof Error &&
          (error.name === 'AbortError' || error.message.includes('cancelled')))
      ) {
        logger.info('Job compilation cancelled by signal', {
          jobId: job.id,
          durationMs: Date.now() - startTime,
        });
        await assertExecutionLease().catch(() => {});
        const current = await this.deps.jobRepository.findById(job.id);
        return current ?? job;
      }

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

      if (!run && !willRetry)
        await this.deps.jobRepository.createRun({
          jobId: job.id,
          extractedData: null,
          extractionReport:
            error instanceof ConfigurationFailure
              ? {
                  quality: ExtractionQuality.Invalid,
                  scope: 'page',
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

      if (run) {
        const retryRecovery =
          reason === CompilationReason.Recovery &&
          willRetry &&
          error instanceof DomainError &&
          error.isRetryable;
        if (retryRecovery) {
          await this.deps.jobRepository.commitRun(
            { ...run, metadata: run.metadata },
            [],
            undefined,
            job.updatedAt
          );
          await this.deps.realtimeService.notifyJobUpdated(
            job.userId,
            job.id,
            JobStatus.Recovering
          );
        } else await this.failRecovery(job, run);
      } else {
        const failureStatus = compilationFailureStatus({
          willRetry,
          hasExistingPlan: Boolean(job.extractionPlan),
          error,
        });
        await this.deps.jobRepository.updateJob(job.id, {
          status: failureStatus,
          lastError: userMessage,
        });
        await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id, failureStatus);
      }

      throw error;
    }
  }
  private async failRecovery(job: ScrapingJobEntity, run: JobRunEntity): Promise<void> {
    const message = formatUserErrorMessage(new CompilerValidationError('Recovery failed.'));
    const completed = await this.deps.jobRepository.commitRun(
      {
        ...run,
        status: RunStatus.Failed,
        errorMessage: message,
        durationMs: Date.now() - (run.startedAt?.getTime() ?? Date.now()),
      },
      [],
      { status: JobStatus.Failed, lastError: message },
      job.updatedAt
    );
    await this.deps.jobScheduler.removeRepeatableJob(job.id, job.bullmqRepeatableKey);
    await this.deps.realtimeService.notifyJobRunCompleted(
      job.userId,
      job.id,
      completed.id,
      completed.hasChanges
    );
    await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id);
  }
}
