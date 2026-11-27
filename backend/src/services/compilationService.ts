import { randomUUID } from 'node:crypto';
import { USER_FAILURES, formatStructuredUserFailure } from '@specter/contracts';
import { classifyAccessFailure } from '../acquisition/failure.js';
import { env } from '../config/env.js';
import {
  AntiBotBlockedError,
  BrowserCapacityError,
  CompilerApiRequestError,
  CompilerTimeoutError,
  CompilerValidationError,
  DomainError,
  InvalidRecoveryStateError,
  JobNotFoundError,
  NavigationTimeoutError,
  QuotaExceededError,
  SelectorMismatchError,
  UnauthorizedError,
} from '../errors/domainErrors.js';
import type { IConfigurationPipeline } from '../extraction/configuration.js';
import { ConfigurationFailure } from '../extraction/configurationFailure.js';
import { sameIntent } from '../extraction/configurationPolicy.js';
import { toPlanExecutionResult } from '../extraction/scrapeResultMapper.js';
import {
  buildFailedCompilationRun,
  buildFailedRunUpdate,
  buildRecoveryCompilationAttemptRun,
} from '../mappers/runBuilder.js';
import { assertExecutionLease } from '../queues/executionLease.js';
import { CompilationReason, type IJobScheduler } from '../queues/scheduler.interface.js';
import type { IJobRepository, UpdateJobPatch } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { IUserRepository } from '../repositories/userRepository.js';
import type { JobRunEntity, ScrapingJobEntity } from '../types/domain.js';
import { JobStatus, RunStatus, isAcceptedExtractionQuality } from '../types/enums.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { logger } from '../utils/logger.js';
import type { ICompilationControl } from './compilationControl.interface.js';
import type { CompilationDiagnosticService } from './compilationDiagnosticService.js';
import { resolveJobExecutionContext } from './executionContext.js';
import type { QuotaService } from './quotaService.js';
import type { RealtimeService } from './realtimeService.js';
import type { SuccessfulRunService } from './successfulRunService.js';

function compilationFailureStatus(input: {
  willRetry: boolean;
  hasExistingPlan: boolean;
  error: unknown;
}): JobStatus {
  const { willRetry, hasExistingPlan, error } = input;
  if (willRetry && error instanceof CompilerApiRequestError && error.statusCode === 429) {
    return JobStatus.PendingCompilation;
  }
  return hasExistingPlan ? JobStatus.Active : JobStatus.Failed;
}

function isActionableCompilationError(error: unknown): boolean {
  if (
    error instanceof AntiBotBlockedError ||
    error instanceof BrowserCapacityError ||
    error instanceof CompilerApiRequestError ||
    error instanceof CompilerTimeoutError ||
    error instanceof NavigationTimeoutError ||
    error instanceof QuotaExceededError ||
    error instanceof UnauthorizedError
  ) {
    return false;
  }
  if (classifyAccessFailure(error) !== undefined) return false;
  return (
    error instanceof ConfigurationFailure ||
    error instanceof CompilerValidationError ||
    error instanceof SelectorMismatchError ||
    (error instanceof DomainError && error.code === 'CONFIGURATION_REJECTED')
  );
}

function shouldSkipCompilation(job: ScrapingJobEntity, reason?: CompilationReason): boolean {
  return (
    job.status === JobStatus.Paused ||
    (reason !== undefined && job.status === JobStatus.Active && Boolean(job.extractionPlan))
  );
}

function isMonitorStale(latest: ScrapingJobEntity | null, expected: ScrapingJobEntity): boolean {
  return (
    !latest ||
    latest.status === JobStatus.Paused ||
    latest.updatedAt.getTime() !== expected.updatedAt.getTime()
  );
}

export interface CompilationServiceDeps {
  jobRepository: IJobRepository;
  userRepository: Pick<IUserRepository, 'findById'>;
  configurationPipeline: IConfigurationPipeline;
  successfulRunService: SuccessfulRunService;
  jobScheduler: IJobScheduler;
  sessionRepository: ISessionRepository;
  realtimeService: RealtimeService;
  quotaService: QuotaService;
  diagnosticService: CompilationDiagnosticService;
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
      if (!current) throw new JobNotFoundError(jobId);
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
    if (!job) throw new JobNotFoundError(jobId);

    if (reason === CompilationReason.Recovery && !runId) {
      throw new InvalidRecoveryStateError('Recovery compilation must be attached to an execution run.');
    }
    if (runId && reason !== CompilationReason.Recovery) {
      throw new InvalidRecoveryStateError('Execution run IDs are only valid for recovery compilations.');
    }

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
      const attempt = buildRecoveryCompilationAttemptRun(run);
      willRetry =
        willRetry && attempt.metadata.compilationAttempts < env.COMPILATION_QUEUE_MAX_ATTEMPTS;
      run = await this.deps.jobRepository.commitRun(attempt.input, [], undefined, job.updatedAt);
    }

    if (shouldSkipCompilation(job, reason)) return job;

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
        if (run) {
          await this.failRecovery(job, run);
          return job;
        }
      }
      throw quotaErr;
    }

    const currentJob = await this.deps.jobRepository.findById(job.id);
    if (!currentJob) throw new JobNotFoundError(job.id);
    if (abortController.signal.aborted || shouldSkipCompilation(currentJob, reason)) {
      return currentJob;
    }

    let httpStatus: number | null = null;

    try {
      logger.info('Starting AI extractor compilation', {
        jobId: job.id,
        provider: 'configuration-pipeline',
      });

      const context = await resolveJobExecutionContext(
        this.deps.userRepository,
        this.deps.sessionRepository,
        job,
        'Using authenticated web session for AI compilation'
      );
      abortController.signal.throwIfAborted();

      const isRecovery = reason === CompilationReason.Recovery;
      const failure = run?.extractionReport;
      const configured = await this.deps.configurationPipeline.configure({
        jobId: job.id,
        url: job.url,
        prompt: job.userPrompt,
        intent: isRecovery ? job.extractionPlan?.intent : undefined,
        recovery:
          isRecovery && failure
            ? {
                failure: {
                  failureCode: failure.failureCode,
                  failureReason: failure.failureReason,
                  quality: failure.quality,
                  issues: failure.issues.slice(0, 8),
                  evidence: failure.evidence?.slice(0, 8),
                },
                previousStrategy: job.extractionPlan?.strategy,
              }
            : undefined,
        storageState: context.storageState,
        pageLanguage: context.pageLanguage,
        captureScreenshot: job.captureScreenshotOnChange,
        signal: abortController.signal,
      });
      abortController.signal.throwIfAborted();

      if (!isAcceptedExtractionQuality(configured.execution.report.quality)) {
        throw new CompilerValidationError('Recovery output did not pass extraction validation.');
      }

      const compiledSchema = configured.plan;
      if (
        isRecovery &&
        job.extractionPlan &&
        !sameIntent(job.extractionPlan.intent, compiledSchema.intent)
      ) {
        throw new CompilerValidationError(
          'Recovery cannot change extraction intent. Review the monitor instructions.'
        );
      }

      logger.info('Extraction semantic review completed', {
        jobId: job.id,
        status: configured.semanticReview.status,
        score: configured.semanticReview.score,
      });

      const execution = toPlanExecutionResult(configured.execution);
      httpStatus = execution.scrape.httpStatus;

      await assertExecutionLease();
      const latest = await this.deps.jobRepository.findById(job.id);
      if (isMonitorStale(latest, job)) return latest ?? job;

      const contractRevision = job.extractionPlan
        ? (job.contractRevision ?? randomUUID())
        : randomUUID();
      const planRevision = randomUUID();
      const prepared = await this.deps.successfulRunService.prepare({
        job,
        plan: compiledSchema,
        execution,
        contractRevision,
        startedAt: run?.startedAt?.getTime() ?? startTime,
        logContext: 'compilation',
        timezone: context.timezone,
      });

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
        durationMs: prepared.run.durationMs ?? 0,
        provider: 'configuration-pipeline',
      });

      await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id, JobStatus.Active);
      return updatedJob ?? job;
    } catch (error) {
      if (abortController.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        logger.info('Job compilation cancelled by signal', {
          jobId: job.id,
          durationMs: Date.now() - startTime,
        });
        await assertExecutionLease().catch(() => {});
        return (await this.deps.jobRepository.findById(job.id)) ?? job;
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
      if (isMonitorStale(current, job)) return current ?? job;

      let userMessage = formatUserErrorMessage(error);
      if (!willRetry && isActionableCompilationError(error)) {
        const diagnosis = await this.deps.diagnosticService.diagnose({
          jobId: job.id,
          url: job.url,
          userPrompt: job.userPrompt,
          failureReason: error instanceof Error ? error.message : undefined,
        });
        if (diagnosis) {
          userMessage = formatStructuredUserFailure({
            title: USER_FAILURES.configurationRejected.title,
            description: diagnosis.issue,
            nextStep: diagnosis.nextSteps,
          });
        }
      }

      if (!run && !willRetry) {
        await this.deps.jobRepository.createRun(
          buildFailedCompilationRun({
            jobId: job.id,
            error,
            userMessage,
            httpStatus,
            durationMs,
          })
        );
      }

      if (run) {
        const retryRecovery =
          reason === CompilationReason.Recovery &&
          willRetry &&
          error instanceof DomainError &&
          error.isRetryable;
        if (retryRecovery) {
          await this.deps.realtimeService.notifyJobUpdated(
            job.userId,
            job.id,
            JobStatus.Recovering
          );
        } else {
          await this.failRecovery(job, run);
        }
      } else {
        const failureStatus = compilationFailureStatus({
          willRetry,
          hasExistingPlan: Boolean(job.extractionPlan),
          error,
        });

        let fallbackPatch: Partial<UpdateJobPatch> = {};
        if (failureStatus === JobStatus.Active && job.planRevision) {
          const stableVersion = await this.deps.jobRepository.findPlanVersionByRevision(
            job.id,
            job.planRevision
          );
          if (stableVersion) {
            fallbackPatch = {
              userPrompt: stableVersion.userPrompt,
              url: stableVersion.url,
            };
          }
        }

        await this.deps.jobRepository.updateJob(job.id, {
          status: failureStatus,
          lastError: userMessage,
          ...fallbackPatch,
        });
        await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id, failureStatus);
        if (failureStatus === JobStatus.Active || failureStatus === JobStatus.Failed) {
          await this.deps.realtimeService.notifyJobCompilationFailed(
            job.userId,
            job.id,
            userMessage,
            failureStatus === JobStatus.Active
          );
        }
      }

      throw error;
    }
  }

  private async failRecovery(job: ScrapingJobEntity, run: JobRunEntity): Promise<void> {
    const message = USER_FAILURES.requestedDataUnavailable.description;
    const completed = await this.deps.jobRepository.commitRun(
      buildFailedRunUpdate(run, message),
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
