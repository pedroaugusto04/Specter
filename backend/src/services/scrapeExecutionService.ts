import { randomUUID } from 'node:crypto';
import { USER_FAILURES } from '@specter/contracts';
import type { AccessCooldownService } from '../acquisition/cooldown.js';
import { classifyAccessFailure } from '../acquisition/failure.js';
import { env } from '../config/env.js';
import {
  DomainError,
  QuotaExceededError,
  UpstreamHttpError,
} from '../errors/domainErrors.js';
import {
  buildAttemptStartRun,
  buildChargeExecutionRun,
  buildFailedRunUpdate,
  buildScheduleRetryRun,
  buildSessionExpiredReport,
  buildStartRecoveryRun,
  cloneRunMetadata,
  markReportSessionExpired,
} from '../mappers/runBuilder.js';
import { assertExecutionLease } from '../queues/executionLease.js';
import { CompilationReason, type IJobScheduler } from '../queues/scheduler.interface.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { IUserRepository } from '../repositories/userRepository.js';
import { AccessFailure } from '../types/access.js';
import type { JobRunEntity, ScrapingJobEntity } from '../types/domain.js';
import { JobStatus, RunStatus, isAcceptedExtractionQuality } from '../types/enums.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import type { RunMetadata } from '../types/run.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { logger } from '../utils/logger.js';
import { resolveJobExecutionContext } from './executionContext.js';
import type { IPlanExecutor } from './planExecutionService.js';
import type { QuotaService } from './quotaService.js';
import type { RealtimeService } from './realtimeService.js';
import { FailureCode } from '../extraction/constants.js';
import type { IAlertRouter } from '../notifications/contracts.js';
import { prepareTerminalFailureAlert } from '../utils/failureAlertHelper.js';
import {
  inspectStorageStateExpiry,
  isAuthFailureStatusCode,
} from '../utils/sessionValidator.js';
import { RecoveryDecision, decideRecovery } from './recoveryPolicy.js';
import type { SuccessfulRunService } from './successfulRunService.js';

interface FinishRunOptions {
  structural: boolean;
  userMessage: string;
  metadata?: RunMetadata;
  extractionReport?: ExtractionReport | null;
  failureCode?: string;
  timezone?: string;
}

export interface ScrapeExecutionServiceDeps {
  accessCooldown: AccessCooldownService;
  jobRepository: IJobRepository;
  userRepository: Pick<IUserRepository, 'findById'>;
  planExecutor: IPlanExecutor;
  successfulRunService: SuccessfulRunService;
  jobScheduler: IJobScheduler;
  sessionRepository: ISessionRepository;
  realtimeService: RealtimeService;
  quotaService: QuotaService;
  alertRouter?: IAlertRouter;
  maxRecoveryAttempts?: number;
}

export class ScrapeExecutionService {
  constructor(private readonly deps: ScrapeExecutionServiceDeps) {}

  async executeScrape(
    jobId: string,
    originQueueId: string = randomUUID(),
    runId?: string
  ): Promise<JobRunEntity | null> {
    const repo = this.deps.jobRepository;
    const job = await repo.findById(jobId);
    if (!job || job.status !== JobStatus.Active) return null;

    const run = runId ? await repo.findRun(runId) : await repo.beginRun(job, originQueueId);
    if (!run || run.jobId !== job.id || run.status !== RunStatus.Running) return null;

    if (run.monitorUpdatedAt?.getTime() !== job.updatedAt.getTime()) {
      await repo.cancelRuns(job.id);
      return null;
    }
    if (run.nextAttemptAt && run.nextAttemptAt.getTime() > Date.now()) return null;
    if (!job.extractionPlan) {
      return this.finish(job, run, {
        structural: true,
        userMessage: USER_FAILURES.requestedDataUnavailable.description,
      });
    }

    const existingMetadata = run.metadata!;
    if (
      Date.now() - run.startedAt!.getTime() > env.RUN_MAX_DURATION_MS ||
      existingMetadata.accessAttempts >= env.SCRAPE_MAX_ATTEMPTS + 1
    ) {
      return this.finish(job, run, {
        structural: false,
        userMessage: USER_FAILURES.requestTimedOut.description,
        failureCode: FailureCode.Timeout,
      });
    }

    const started = buildAttemptStartRun(run);
    let metadata = started.metadata;
    await repo.commitRun(started.input, [], undefined, job.updatedAt);
    await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id);

    let report: ExtractionReport | undefined;
    let error: unknown;
    let access: Awaited<ReturnType<AccessCooldownService['forMonitor']>> | undefined;
    let executionTimezone: string | undefined;
    let context: Awaited<ReturnType<typeof resolveJobExecutionContext>> | undefined;

    try {
      access = await this.deps.accessCooldown.forMonitor(job);
      if (await access.state()) {
        return this.finish(job, run, {
          structural: false,
          userMessage: USER_FAILURES.accessBlocked.description,
          metadata,
        });
      }

      if (!metadata.executionCharged) {
        await this.deps.quotaService.assertCanExecuteScrape(job.userId);
        const charged = buildChargeExecutionRun(run, metadata);
        metadata = charged.metadata;
        await repo.commitRun(charged.input, [], undefined, job.updatedAt);
      }

      context = await resolveJobExecutionContext(
        this.deps.userRepository,
        this.deps.sessionRepository,
        job,
        'Executing monitor'
      );
      executionTimezone = context.timezone;

      if (context.storageState) {
        const expiry = inspectStorageStateExpiry(context.storageState, job.url);
        if (expiry.isExpired) {
          logger.warn('Saved web session deterministically expired before execution', {
            jobId: job.id,
            reason: expiry.reason,
            detail: expiry.detail,
          });
          return this.finish(job, run, {
            structural: false,
            userMessage: USER_FAILURES.sessionUnavailable.description,
            metadata,
            extractionReport: buildSessionExpiredReport(job.extractionPlan.intent.scope, {
              preflight: true,
            }),
            failureCode: FailureCode.SessionExpired,
            timezone: executionTimezone,
          });
        }
      }

      const execution = await this.deps.planExecutor.execute(job.url, job.extractionPlan, {
        storageState: context.storageState,
        pageLanguage: context.pageLanguage,
        captureScreenshot: job.captureScreenshotOnChange,
      });
      report = execution.report;
      if (
        context.storageState &&
        !isAcceptedExtractionQuality(report.quality) &&
        isAuthFailureStatusCode(execution.scrape.httpStatus)
      ) {
        report = markReportSessionExpired(report);
      }
      await assertExecutionLease();
      await access.record(false);

      if (
        decideRecovery({ report, metadata, maxAccessAttempts: env.SCRAPE_MAX_ATTEMPTS }) ===
        RecoveryDecision.Accept
      ) {
        const prepared = await this.deps.successfulRunService.prepare({
          job,
          plan: job.extractionPlan,
          execution,
          contractRevision: job.contractRevision,
          startedAt: run.startedAt!.getTime(),
          logContext: 'routine scraping',
          timezone: context.timezone,
        });
        const result = await repo.commitRun(
          { ...prepared.run, id: run.id },
          prepared.deliveries,
          { lastError: null, lastFailureAlertAt: null },
          job.updatedAt
        );
        await this.completed(job, result);
        return result;
      }
    } catch (caught) {
      error = caught;
      if (
        context?.storageState &&
        caught instanceof UpstreamHttpError &&
        isAuthFailureStatusCode(caught.httpStatus)
      ) {
        report = buildSessionExpiredReport(job.extractionPlan.intent.scope, { pagesVisited: 1 });
      }
      await assertExecutionLease();
      logger.error('Monitor attempt failed', {
        jobId,
        runId: run.id,
        errorStack: caught instanceof Error ? caught.stack : String(caught),
      });
      if (classifyAccessFailure(caught) === AccessFailure.Blocked) {
        await access?.record(true);
      }
    }

    const [current, latestRun] = await Promise.all([repo.findById(jobId), repo.findRun(run.id)]);
    if (
      !current ||
      current.status !== job.status ||
      current.updatedAt.getTime() !== job.updatedAt.getTime() ||
      latestRun?.status !== RunStatus.Running
    ) {
      return null;
    }

    const decision = decideRecovery({
      report,
      error,
      metadata,
      maxAccessAttempts: env.SCRAPE_MAX_ATTEMPTS,
    });
    const reason =
      error instanceof DomainError
        ? error.code
        : (report?.failureReason ?? report?.failureCode ?? decision);

    if (decision === RecoveryDecision.Recompile) {
      const inWindow =
        job.recoveryWindowStartedAt &&
        Date.now() - job.recoveryWindowStartedAt.getTime() < env.RECOVERY_WINDOW_MS;
      const attempts = inWindow ? job.recoveryAttempts : 0;
      const failedMetadata = appendReason(metadata, reason);
      if (attempts >= (this.deps.maxRecoveryAttempts ?? env.MAX_RECOVERY_ATTEMPTS)) {
        return this.finish(job, run, {
          structural: true,
          userMessage: USER_FAILURES.requestedDataUnavailable.description,
          metadata: failedMetadata,
          extractionReport: report ?? null,
          failureCode: report?.failureCode,
          timezone: executionTimezone,
        });
      }
      try {
        await this.deps.quotaService.assertCanCompile(job.userId);
      } catch (quotaErr) {
        if (!(quotaErr instanceof QuotaExceededError)) throw quotaErr;
        return this.finish(job, run, {
          structural: false,
          userMessage: formatUserErrorMessage(quotaErr),
          metadata: failedMetadata,
          extractionReport: report ?? null,
          timezone: executionTimezone,
        });
      }

      await repo.commitRun(
        buildStartRecoveryRun(run, metadata, report, reason),
        [],
        {
          status: JobStatus.Recovering,
          recoveryAttempts: attempts + 1,
          recoveryWindowStartedAt: inWindow ? job.recoveryWindowStartedAt : new Date(),
        },
        job.updatedAt
      );
      await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id);
      await this.deps.jobScheduler.enqueueCompilation(job.id, CompilationReason.Recovery, run.id);
      return null;
    }

    if (decision === RecoveryDecision.Retry || decision === RecoveryDecision.Confirm) {
      const isConfirmation = decision === RecoveryDecision.Confirm;
      const delay = isConfirmation
        ? Math.max(env.EXTRACTION_CONFIRMATION_DELAY_MS, env.MIN_CRON_INTERVAL_MINUTES * 60000)
        : Math.max(
            env.SCRAPE_RETRY_DELAY_MS * 2 ** (metadata.accessAttempts - 1),
            extractRetryAfterMs(error)
          );
      const nextAttemptAt = new Date(Date.now() + delay);
      const retry = buildScheduleRetryRun(
        run,
        metadata,
        report,
        reason,
        isConfirmation,
        nextAttemptAt
      );

      await repo.commitRun(retry.input, [], undefined, job.updatedAt);
      await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id);
      await this.deps.jobScheduler.enqueueRunAttempt(
        job.id,
        run.id,
        retry.metadata.accessAttempts,
        nextAttemptAt
      );
      return null;
    }

    const isSessionExpired = report?.failureCode === FailureCode.SessionExpired;
    const userMessage = isSessionExpired
      ? USER_FAILURES.sessionUnavailable.description
      : error
        ? formatUserErrorMessage(error)
        : USER_FAILURES.requestedDataUnavailable.description;
    return this.finish(job, run, {
      structural: Boolean(report?.structuralFailure),
      userMessage,
      metadata: appendReason(metadata, reason),
      extractionReport: report ?? null,
      failureCode: report?.failureCode,
      timezone: executionTimezone,
    });
  }

  private async finish(
    job: ScrapingJobEntity,
    run: JobRunEntity,
    options: FinishRunOptions
  ): Promise<JobRunEntity> {
    const { structural, userMessage, metadata, extractionReport, timezone } = options;
    const failureCode = options.failureCode ?? extractionReport?.failureCode;
    const { deliveries, jobPatch } = await prepareTerminalFailureAlert({
      alertRouter: this.deps.alertRouter,
      job,
      userMessage,
      failureCode,
      timezone,
    });

    const overrides = {
      ...(metadata ? { metadata } : {}),
      ...(extractionReport !== undefined ? { extractionReport } : {}),
    };

    const result = await this.deps.jobRepository.commitRun(
      buildFailedRunUpdate(run, userMessage, overrides),
      deliveries,
      {
        status: structural ? JobStatus.Failed : JobStatus.Active,
        lastError: userMessage,
        ...jobPatch,
      },
      job.updatedAt
    );
    if (structural) {
      await this.deps.jobScheduler.removeRepeatableJob(job.id, job.bullmqRepeatableKey);
    }
    await this.completed(job, result);
    return result;
  }

  private async completed(job: ScrapingJobEntity, run: JobRunEntity): Promise<void> {
    await this.deps.realtimeService.notifyJobRunCompleted(
      job.userId,
      job.id,
      run.id,
      run.hasChanges
    );
    await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id);
  }
}

function appendReason(metadata: RunMetadata, reason: string): RunMetadata {
  const next = cloneRunMetadata(metadata);
  next.reasons.push(reason);
  return next;
}

function extractRetryAfterMs(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  if ('retryAfterMs' in error && typeof error.retryAfterMs === 'number') return error.retryAfterMs;
  return 'cause' in error ? extractRetryAfterMs(error.cause) : 0;
}
