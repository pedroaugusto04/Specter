import { SuccessfulRunService } from './successfulRunService.js';
import { AccessFailure } from '../types/access.js';
import { FailureCode } from '../extraction/constants.js';
import { classifyAccessFailure, AcquisitionFailureError } from '../acquisition/failure.js';
import type { AccessCooldownService } from '../acquisition/cooldown.js';
import type { IAlertRouter } from '../notifications/contracts.js';
import type { IPlanExecutor } from './planExecutionService.js';
import { assertExecutionLease } from '../queues/executionLease.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import { env } from '../config/env.js';
import {
  AntiBotBlockedError,
  DomainError,
  NavigationTimeoutError,
  NotFoundError,
  QuotaExceededError,
  SelectorMismatchError,
} from '../errors/domainErrors.js';
import type { IStorageProvider } from '../providers/storage/index.js';
import { CompilationReason, type IJobScheduler } from '../queues/scheduler.interface.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { JobRunEntity } from '../types/domain.js';
import { presentExtractionReport, formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { logger } from '../utils/logger.js';
import {
  ChangeStatus,
  ExtractionQuality,
  isAcceptedExtractionQuality,
  JobStatus,
  RunStatus,
} from '../types/enums.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';
import type { RealtimeService } from './realtimeService.js';
import type { QuotaService } from './quotaService.js';

export interface ScrapeExecutionServiceDeps {
  accessCooldown?: AccessCooldownService;
  jobRepository: IJobRepository;
  planExecutor: IPlanExecutor;
  alertRouter: IAlertRouter;
  jobScheduler: IJobScheduler;
  storageProvider: IStorageProvider;
  sessionRepository?: ISessionRepository;
  realtimeService?: RealtimeService;
  quotaService?: QuotaService;
  consecutiveFailuresForHealing?: number;
  maxHealingRetries?: number;
}

export class ScrapeExecutionService {
  private readonly consecutiveFailuresForHealing: number;
  private readonly maxHealingRetries: number;
  constructor(private readonly deps: ScrapeExecutionServiceDeps) {
    this.consecutiveFailuresForHealing =
      deps.consecutiveFailuresForHealing ?? env.CONSECUTIVE_FAILURES_FOR_HEALING;
    this.maxHealingRetries = deps.maxHealingRetries ?? env.MAX_HEALING_RETRIES;
  }

  async isAccessSuspended(jobId: string): Promise<boolean> {
    if (!this.deps.accessCooldown) return false;
    const job = await this.deps.jobRepository.findById(jobId);
    const state = job ? await this.deps.accessCooldown.state(job) : null;
    if (state)
      logger.info('Skipping scrape during access cooldown', { jobId, retryAt: state.retryAt });
    return Boolean(state);
  }

  async executeScrape(jobId: string): Promise<JobRunEntity | null> {
    const startTime = Date.now();
    const job = await this.deps.jobRepository.findById(jobId);

    if (!job) {
      throw new NotFoundError(`Scraping job not found: ${jobId}`);
    }

    if (job.status !== JobStatus.Active) {
      logger.info('Skipping scrape execution for PAUSED job', { jobId: job.id });
      return null;
    }

    if (this.deps.quotaService && job.userId) {
      try {
        await this.deps.quotaService.assertCanExecuteScrape(job.userId);
      } catch (quotaErr) {
        if (quotaErr instanceof QuotaExceededError) {
          logger.warn('Skipping scrape execution: monthly execution quota reached', {
            jobId: job.id,
            userId: job.userId,
            quotaLimit: quotaErr.limit,
            current: quotaErr.current,
          });
          return null;
        }
        throw quotaErr;
      }
    }

    const access = await this.deps.accessCooldown?.forMonitor(job);
    if (await access?.state()) return null;

    if (!job.extractionPlan) {
      logger.info('Job has no extractionPlan; enqueueing compilation', { jobId: job.id });
      await this.deps.jobScheduler.enqueueCompilation(job.id, CompilationReason.Initial);
      return null;
    }

    await this.deps.realtimeService?.notifyJobUpdated(job.userId, job.id, 'RUNNING');

    let httpStatus: number | null = null;
    let extractionReport: ExtractionReport | undefined;

    try {
      const storageState = await resolveSessionStorageState(
        this.deps.sessionRepository,
        job.userId,
        job.url,
        {
          jobId: job.id,
          logAction: 'Injecting authenticated web session into Playwright scraper',
        }
      );

      const execution = await this.deps.planExecutor.execute(job.url, job.extractionPlan, {
        storageState,
        captureScreenshot: job.captureScreenshotOnChange,
      });

      if (this.deps.quotaService && job.userId) {
        await this.deps.quotaService.recordExecution(job.userId);
      }
      extractionReport = execution.report;
      const scrapeResult = execution.scrape;
      const extractedData = execution.data;
      httpStatus = scrapeResult.httpStatus;
      await assertExecutionLease();
      const latest = await this.deps.jobRepository.findById(job.id);
      if (
        !latest ||
        latest.status !== job.status ||
        latest.updatedAt.getTime() !== job.updatedAt.getTime()
      )
        return null;

      await access?.record(false);
      if (!isAcceptedExtractionQuality(execution.report.quality)) {
        logger.warn('Extraction rejected', {
          jobId: job.id,
          quality: execution.report.quality,
          failureCode: execution.report.failureCode,
          issues: execution.report.issues,
        });
        if (
          (execution.report.quality === ExtractionQuality.Invalid &&
            (execution.report.failureCode === FailureCode.Source ||
              execution.report.failureCode === FailureCode.Readiness)) ||
          ((execution.report.quality === ExtractionQuality.Inconclusive ||
            execution.report.failureCode === FailureCode.NoProgress) &&
            job.failureCount + 1 >= this.consecutiveFailuresForHealing)
        )
          throw new SelectorMismatchError(execution.report.issues.join(' '));
        await this.deps.jobRepository.createRun({
          jobId: job.id,
          extractedData,
          hasChanges: ChangeStatus.Unchanged,
          status: RunStatus.Failed,
          extractionReport: presentExtractionReport(execution.report),
          errorMessage: formatUserErrorMessage(
            new SelectorMismatchError('Extraction could not be validated.')
          ),
          httpStatus,
        });
        const selectorFailure =
          execution.report.failureCode === FailureCode.Source ||
          execution.report.failureCode === FailureCode.Readiness ||
          execution.report.failureCode === FailureCode.NoProgress;
        await this.deps.jobRepository.updateJob(job.id, {
          lastError: formatUserErrorMessage(
            new SelectorMismatchError('Extraction could not be validated.')
          ),
          ...(selectorFailure ? { failureCount: job.failureCount + 1 } : { failureCount: 0 }),
        });
        return null;
      }
      const prepared = await new SuccessfulRunService(this.deps).prepare({
        job,
        plan: job.extractionPlan,
        execution,
        contractRevision: job.contractRevision,
        startedAt: startTime,
        logContext: 'routine scraping',
      });
      const runRecord = await this.deps.jobRepository.commitRun(
        prepared.run,
        prepared.deliveries,
        { status: JobStatus.Active, failureCount: 0, lastError: null },
        job.updatedAt
      );
      const durationMs = prepared.run.durationMs ?? 0;
      const hasChanges = prepared.run.hasChanges;
      logger.info('Deterministic scrape execution completed', {
        jobId: job.id,
        durationMs,
        httpStatus,
        hasChanges,
      });

      await this.deps.realtimeService?.notifyJobRunCompleted(
        job.userId,
        job.id,
        runRecord.id,
        hasChanges
      );
      await this.deps.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Active);

      return runRecord;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? (error.stack ?? errorMessage) : errorMessage;
      const errorCode = error instanceof DomainError ? error.code : 'SCRAPE_EXECUTION_ERROR';

      if (error instanceof AntiBotBlockedError) {
        httpStatus = error.httpStatus;
      }

      logger.error('Scrape execution failed', {
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
        current.status !== job.status ||
        current.updatedAt.getTime() !== job.updatedAt.getTime()
      )
        return null;
      const accessFailure = classifyAccessFailure(error);
      if (!extractionReport) await access?.record(accessFailure === AccessFailure.Blocked);
      const userMessage = formatUserErrorMessage(error);

      await this.deps.jobRepository.createRun({
        jobId: job.id,
        extractedData: null,
        normalizedHash: null,
        hasChanges: ChangeStatus.Unchanged,
        status: RunStatus.Failed,
        extractionReport: extractionReport
          ? presentExtractionReport(extractionReport)
          : {
              quality:
                accessFailure === AccessFailure.Blocked
                  ? ExtractionQuality.Blocked
                  : ExtractionQuality.Inconclusive,
              scope: job.extractionPlan.intent.scope,
              pagesVisited: 0,
              issues: [userMessage],
              sourcesUsed: {},
            },
        errorMessage: userMessage,
        httpStatus,
        durationMs,
      });

      // 1. Selector Mismatch (HTTP 200 OK, but layout changed): Self-Healing state machine
      if (error instanceof SelectorMismatchError) {
        const inHealingWindow = Boolean(
          job.healingWindowStartedAt &&
            Date.now() - job.healingWindowStartedAt.getTime() < env.HEALING_WINDOW_MS
        );
        const currentHealingAttempts = inHealingWindow ? (job.healingAttempts ?? 0) : 0;
        const newFailureCount = job.failureCount + 1;

        if (
          newFailureCount >= this.consecutiveFailuresForHealing &&
          currentHealingAttempts >= this.maxHealingRetries
        ) {
          // Cap maximum self-healing retries to prevent infinite recompilation loops
          await this.deps.jobRepository.updateJob(job.id, {
            status: JobStatus.Failed,
            failureCount: newFailureCount,
            lastError: `Self-healing retry limit exceeded (${this.maxHealingRetries}): ${userMessage}`,
          });
          await this.deps.jobScheduler.removeRepeatableJob(job.id, job.bullmqRepeatableKey);
          logger.warn('Job exceeded max self-healing retries and transitioned to FAILED', {
            jobId: job.id,
            failureCount: newFailureCount,
          });
          await this.deps.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Failed);
          return null;
        }

        if (newFailureCount >= this.consecutiveFailuresForHealing) {
          await this.deps.jobRepository.updateJob(job.id, {
            status: JobStatus.Healing,
            healingAttempts: currentHealingAttempts + 1,
            healingWindowStartedAt: inHealingWindow ? job.healingWindowStartedAt : new Date(),
            failureCount: newFailureCount,
            lastError: userMessage,
          });
          logger.info(
            'Consecutive selector mismatches reached threshold; transitioning to HEALING',
            {
              jobId: job.id,
              failureCount: newFailureCount,
            }
          );
          await this.deps.jobScheduler.enqueueCompilation(job.id, CompilationReason.Healing);
          await this.deps.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Healing);
          return null;
        }

        // First selector failure: keep ACTIVE, increment failureCount
        await this.deps.jobRepository.updateJob(job.id, {
          status: JobStatus.Active,
          failureCount: newFailureCount,
          lastError: userMessage,
        });
        await this.deps.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Active);
        return null;
      }

      // 2. All other failures (Anti-bot block, acquisition failures, timeouts, domain/network errors):
      // Record failure for audit, reset failureCount, and rethrow (or return null if blocked)
      await this.deps.jobRepository.updateJob(job.id, {
        lastError: userMessage,
        failureCount: 0,
      });
      await this.deps.realtimeService?.notifyJobUpdated(job.userId, job.id);

      if (accessFailure === AccessFailure.Blocked) {
        return null;
      }

      throw error;
    }
  }
}
