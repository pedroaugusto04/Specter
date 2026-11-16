import { randomUUID } from 'crypto';
import { decideRecovery, RecoveryDecision } from './recoveryPolicy.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import { SuccessfulRunService } from './successfulRunService.js';
import { AccessFailure } from '../types/access.js';
import { classifyAccessFailure } from '../acquisition/failure.js';
import type { AccessCooldownService } from '../acquisition/cooldown.js';
import type { IAlertRouter } from '../notifications/contracts.js';
import type { IPlanExecutor } from './planExecutionService.js';
import { assertExecutionLease } from '../queues/executionLease.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import { env, MINIMUM_CRON_INTERVAL_MINUTES } from '../config/env.js';
import {
  AntiBotBlockedError,
  DomainError,
  NavigationTimeoutError,
  QuotaExceededError,
  SelectorMismatchError,
} from '../errors/domainErrors.js';
import type { IStorageProvider } from '../providers/storage/index.js';
import { CompilationReason, type IJobScheduler } from '../queues/scheduler.interface.js';
import { RunPhase } from '@specter/contracts';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { JobRunEntity } from '../types/domain.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { logger } from '../utils/logger.js';
import { JobStatus, RunStatus } from '../types/enums.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';
import type { RealtimeService } from './realtimeService.js';
import type { QuotaService } from './quotaService.js';

export interface ScrapeExecutionServiceDeps {
  accessCooldown: AccessCooldownService;
  jobRepository: IJobRepository;
  planExecutor: IPlanExecutor;
  alertRouter: IAlertRouter;
  jobScheduler: IJobScheduler;
  storageProvider: IStorageProvider;
  sessionRepository: ISessionRepository;
  realtimeService: RealtimeService;
  quotaService: QuotaService;
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
    if (!job.extractionPlan) return this.finish(job, run, true);
    const metadata = run.metadata!;
    if (
      Date.now() - run.startedAt!.getTime() > env.RUN_MAX_DURATION_MS ||
      metadata.accessAttempts >= env.SCRAPE_MAX_ATTEMPTS + 1
    )
      return this.finish(
        job,
        run,
        false,
        new NavigationTimeoutError('Execution exceeded its allowed duration.')
      );
    metadata.accessAttempts++;
    await repo.commitRun(
      {
        ...run,
        phase: metadata.confirmations ? RunPhase.Confirming : RunPhase.Checking,
        nextAttemptAt: null,
        metadata,
      },
      [],
      undefined,
      job.updatedAt
    );
    await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id);
    let report: ExtractionReport | undefined;
    let error: unknown;
    let access: Awaited<ReturnType<AccessCooldownService['forMonitor']>> | undefined;
    try {
      access = await this.deps.accessCooldown.forMonitor(job);
      if (await access.state())
        return this.finish(
          job,
          run,
          false,
          new AntiBotBlockedError('Website access is temporarily blocked.')
        );
      if (!metadata.executionCharged) {
        if (job.userId) {
          await this.deps.quotaService.assertCanExecuteScrape(job.userId);
        }
        metadata.executionCharged = true;
        await repo.commitRun(
          { ...run, metadata, chargeUsage: 'execution' },
          [],
          undefined,
          job.updatedAt
        );
      }
      const storageState = await resolveSessionStorageState(
        this.deps.sessionRepository,
        job.userId,
        job.url,
        { jobId: job.id, logAction: 'Executing monitor' }
      );
      const execution = await this.deps.planExecutor.execute(job.url, job.extractionPlan, {
        storageState,
        captureScreenshot: job.captureScreenshotOnChange,
      });
      report = execution.report;
      await assertExecutionLease();
      await access?.record(false);
      if (
        decideRecovery({ report, metadata, maxAccessAttempts: env.SCRAPE_MAX_ATTEMPTS }) ===
        RecoveryDecision.Accept
      ) {
        const prepared = await new SuccessfulRunService(this.deps).prepare({
          job,
          plan: job.extractionPlan,
          execution,
          contractRevision: job.contractRevision,
          startedAt: run.startedAt!.getTime(),
          logContext: 'routine scraping',
        });
        const result = await repo.commitRun(
          { ...prepared.run, id: run.id },
          prepared.deliveries,
          { lastError: null },
          job.updatedAt
        );
        await this.completed(job, result);
        return result;
      }
    } catch (caught) {
      error = caught;
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
    const current = await repo.findById(jobId);
    if (
      !current ||
      current.status !== job.status ||
      current.updatedAt.getTime() !== job.updatedAt.getTime() ||
      (await repo.findRun(run.id))?.status !== RunStatus.Running
    )
      return null;
    const decision = decideRecovery({
      report,
      error,
      metadata,
      maxAccessAttempts: env.SCRAPE_MAX_ATTEMPTS,
    });
    metadata.reasons.push(
      error instanceof DomainError
        ? error.code
        : (report?.failureReason ?? report?.failureCode ?? decision)
    );
    run.extractionReport = report ?? null;
    if (decision === RecoveryDecision.Recompile) {
      const inWindow =
        job.recoveryWindowStartedAt &&
        Date.now() - job.recoveryWindowStartedAt.getTime() < env.RECOVERY_WINDOW_MS;
      const attempts = inWindow ? (job.recoveryAttempts ?? 0) : 0;
      if (attempts >= (this.deps.maxRecoveryAttempts ?? env.MAX_RECOVERY_ATTEMPTS))
        return this.finish(job, run, true);
      try {
        await this.deps.quotaService.assertCanCompile(job.userId);
      } catch (error) {
        if (!(error instanceof QuotaExceededError)) throw error;
        return this.finish(job, run, false, error);
      }
      metadata.recoveryAttempts++;
      await repo.commitRun(
        { ...run, metadata, phase: RunPhase.Recovering, nextAttemptAt: null },
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
      const delay =
        decision === RecoveryDecision.Confirm
          ? Math.max(
              MINIMUM_CRON_INTERVAL_MINUTES * 60000,
              env.EXTRACTION_CONFIRMATION_DELAY_MS,
              env.MIN_CRON_INTERVAL_MINUTES * 60000
            )
          : Math.max(
              env.SCRAPE_RETRY_DELAY_MS * 2 ** (metadata.accessAttempts - 1),
              retryAfter(error)
            );
      if (decision === RecoveryDecision.Confirm) metadata.confirmations++;
      const nextAttemptAt = new Date(Date.now() + delay);
      await repo.commitRun(
        {
          ...run,
          metadata,
          phase: decision === RecoveryDecision.Confirm ? RunPhase.Confirming : RunPhase.Retrying,
          nextAttemptAt,
        },
        [],
        undefined,
        job.updatedAt
      );
      await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id);
      await this.deps.jobScheduler.enqueueRunAttempt(
        job.id,
        run.id,
        metadata.accessAttempts,
        nextAttemptAt
      );
      return null;
    }
    return this.finish(job, run, Boolean(report?.structuralFailure), error);
  }

  private async finish(
    job: ScrapingJobEntity,
    run: JobRunEntity,
    structural: boolean,
    error?: unknown
  ) {
    const userMessage = formatUserErrorMessage(
      error ?? new SelectorMismatchError('Execution could not be validated.')
    );
    const result = await this.deps.jobRepository.commitRun(
      {
        ...run,
        status: RunStatus.Failed,
        errorMessage: userMessage,
        durationMs: Date.now() - (run.startedAt?.getTime() ?? Date.now()),
      },
      [],
      {
        status: structural ? JobStatus.Failed : JobStatus.Active,
        lastError: userMessage,
      },
      job.updatedAt
    );
    if (structural)
      await this.deps.jobScheduler.removeRepeatableJob(job.id, job.bullmqRepeatableKey);
    await this.completed(job, result);
    return result;
  }
  private async completed(job: ScrapingJobEntity, run: JobRunEntity) {
    await this.deps.realtimeService.notifyJobRunCompleted(
      job.userId,
      job.id,
      run.id,
      run.hasChanges
    );
    await this.deps.realtimeService.notifyJobUpdated(job.userId, job.id);
  }
}

function retryAfter(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  if ('retryAfterMs' in error && typeof error.retryAfterMs === 'number') return error.retryAfterMs;
  return 'cause' in error ? retryAfter(error.cause) : 0;
}
