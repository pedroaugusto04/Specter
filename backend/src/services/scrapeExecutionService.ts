import { assertExecutionLease } from '../queues/executionLease.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import { env } from '../config/env.js';
import {
  AntiBotBlockedError,
  DomainError,
  NavigationTimeoutError,
  NotFoundError,
  SelectorMismatchError,
} from '../errors/domainErrors.js';
import type { INotificationProvider } from '../providers/notifications/notification.interface.js';
import type { IScraperEngine } from '../providers/scraping/scraper.interface.js';
import { createStorageProvider, type IStorageProvider } from '../providers/storage/index.js';
import type { IJobScheduler } from '../queues/scheduler.interface.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { JobRunEntity } from '../types/domain.js';
import { computeExtractionHash } from '../utils/diffHasher.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { PlanExecutionService } from './planExecutionService.js';
import { logger } from '../utils/logger.js';
import { evaluateAndDispatchChangeAlert } from '../utils/changeAlertHelper.js';
import {
  ChangeStatus,
  ExtractionQuality,
  isAcceptedExtractionQuality,
  JobStatus,
  RunStatus,
} from '../types/enums.js';
import { uploadScreenshotIfEligible } from '../utils/screenshotHelper.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';
import type { RealtimeService } from './realtimeService.js';

export interface ScrapeExecutionServiceDeps {
  jobRepository: IJobRepository;
  scraperEngine: IScraperEngine;
  notificationProvider: INotificationProvider;
  jobScheduler: IJobScheduler;
  storageProvider?: IStorageProvider;
  sessionRepository?: ISessionRepository;
  realtimeService?: RealtimeService;
  consecutiveFailuresForHealing?: number;
  maxHealingRetries?: number;
}

export class ScrapeExecutionService {
  private readonly jobRepository: IJobRepository;
  private readonly scraperEngine: IScraperEngine;
  private readonly notificationProvider: INotificationProvider;
  private readonly jobScheduler: IJobScheduler;
  private readonly storageProvider: IStorageProvider;
  private readonly sessionRepository?: ISessionRepository;
  private readonly realtimeService?: RealtimeService;
  private readonly consecutiveFailuresForHealing: number;
  private readonly maxHealingRetries: number;

  constructor(deps: ScrapeExecutionServiceDeps) {
    this.jobRepository = deps.jobRepository;
    this.scraperEngine = deps.scraperEngine;
    this.notificationProvider = deps.notificationProvider;
    this.jobScheduler = deps.jobScheduler;
    this.storageProvider = deps.storageProvider ?? createStorageProvider();
    this.sessionRepository = deps.sessionRepository;
    this.realtimeService = deps.realtimeService;
    this.consecutiveFailuresForHealing =
      deps.consecutiveFailuresForHealing ?? env.CONSECUTIVE_FAILURES_FOR_HEALING;
    this.maxHealingRetries = deps.maxHealingRetries ?? env.MAX_HEALING_RETRIES;
  }

  async executeScrape(jobId: string): Promise<JobRunEntity | null> {
    const startTime = Date.now();
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new NotFoundError(`Scraping job not found: ${jobId}`);
    }

    if (job.status !== JobStatus.Active) {
      logger.info('Skipping scrape execution for PAUSED job', { jobId: job.id });
      return null;
    }

    if (!job.extractionPlan) {
      logger.info('Job has no extractionPlan; enqueueing compilation', { jobId: job.id });
      await this.jobScheduler.enqueueCompilation(job.id, 'initial');
      return null;
    }

    let httpStatus: number | null = null;
    let extractionReport: ExtractionReport | undefined;

    try {
      const storageState = await resolveSessionStorageState(
        this.sessionRepository,
        job.userId,
        job.url,
        {
          jobId: job.id,
          logAction: 'Injecting authenticated web session into Playwright scraper',
        }
      );

      const execution = await new PlanExecutionService(this.scraperEngine).execute(
        job.url,
        job.extractionPlan,
        {
          storageState,
          captureScreenshot: job.captureScreenshotOnChange,
        }
      );
      extractionReport = execution.report;
      const scrapeResult = execution.scrape;
      const extractedData = execution.data;
      httpStatus = scrapeResult.httpStatus;
      if (!isAcceptedExtractionQuality(execution.report.quality)) {
        if (execution.report.quality === ExtractionQuality.Invalid)
          throw new SelectorMismatchError(execution.report.issues.join(' '));
        await this.jobRepository.createRun({
          jobId: job.id,
          extractedData,
          hasChanges: ChangeStatus.Unchanged,
          status: RunStatus.Failed,
          extractionReport: execution.report,
          errorMessage: execution.report.issues.join(' '),
          httpStatus,
        });
        await this.jobRepository.updateJob(job.id, {
          lastError: execution.report.issues.join(' '),
        });
        return null;
      }
      await assertExecutionLease();
      const latest = await this.jobRepository.findById(job.id);
      if (
        !latest ||
        latest.status !== job.status ||
        latest.updatedAt.getTime() !== job.updatedAt.getTime()
      )
        return null;

      const currentHash = computeExtractionHash(extractedData);
      const candidate = await this.jobRepository.findLatestSuccessfulRun(job.id);
      const previousRun = candidate?.contractRevision === job.contractRevision ? candidate : null;

      let hasChanges: ChangeStatus = ChangeStatus.Initial;
      if (previousRun) {
        hasChanges =
          previousRun.normalizedHash === currentHash
            ? ChangeStatus.Unchanged
            : ChangeStatus.Changed;
      }

      const screenshotUrl = await uploadScreenshotIfEligible({
        jobId: job.id,
        captureScreenshotOnChange: job.captureScreenshotOnChange,
        hasChanges,
        screenshot: scrapeResult.screenshot,
        storageProvider: this.storageProvider,
        logContext: 'routine scraping',
      });

      const durationMs = Date.now() - startTime;

      const runRecord = await this.jobRepository.createRun({
        jobId: job.id,
        extractedData,
        normalizedHash: currentHash,
        hasChanges,
        status: RunStatus.Success,
        extractionReport: execution.report,
        contractRevision: job.contractRevision,
        httpStatus,
        durationMs,
        screenshotUrl,
      });

      // Reset failure counter and ensure ACTIVE status on successful run
      if (job.failureCount > 0 || job.lastError !== null || job.status !== JobStatus.Active) {
        await this.jobRepository.updateJob(job.id, {
          status: JobStatus.Active,
          failureCount: 0,
          lastError: null,
        });
      }

      // Send notification only when actual changes occur compared to a prior snapshot
      if (hasChanges === ChangeStatus.Changed && previousRun) {
        await evaluateAndDispatchChangeAlert({
          job,
          currentData: extractedData,
          previousData: previousRun.extractedData,
          triggerRules: job.extractionPlan?.triggerRules,
          triggerMatchMode: job.extractionPlan?.triggerMatchMode,
          notificationProvider: this.notificationProvider,
          screenshotUrl,
        });
      }

      logger.info('Deterministic scrape execution completed', {
        jobId: job.id,
        durationMs,
        httpStatus,
        hasChanges,
      });

      await this.realtimeService?.notifyJobRunCompleted(
        job.userId,
        job.id,
        runRecord.id,
        hasChanges
      );
      await this.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Active);

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
      const current = await this.jobRepository.findById(job.id);
      if (
        !current ||
        current.status !== job.status ||
        current.updatedAt.getTime() !== job.updatedAt.getTime()
      )
        return null;
      const userMessage = formatUserErrorMessage(error);

      await this.jobRepository.createRun({
        jobId: job.id,
        extractedData: null,
        normalizedHash: null,
        hasChanges: ChangeStatus.Unchanged,
        status: RunStatus.Failed,
        extractionReport: extractionReport ?? {
          quality:
            error instanceof AntiBotBlockedError
              ? ExtractionQuality.Blocked
              : ExtractionQuality.Inconclusive,
          scope: job.extractionPlan.scope,
          pagesVisited: 0,
          issues: [userMessage],
          sourcesUsed: {},
        },
        errorMessage: userMessage,
        httpStatus,
        durationMs,
      });

      // 1. Anti-bot / WAF block (HTTP 403/429): DO NOT trigger layout self-healing
      if (error instanceof AntiBotBlockedError) {
        await this.jobRepository.updateJob(job.id, {
          lastError: userMessage,
        });
        await this.realtimeService?.notifyJobUpdated(job.userId, job.id);
        return null;
      }

      // 2. Navigation / Network Timeout: DO NOT recompile; rethrow for BullMQ exponential backoff
      if (error instanceof NavigationTimeoutError) {
        await this.jobRepository.updateJob(job.id, {
          lastError: userMessage,
        });
        await this.realtimeService?.notifyJobUpdated(job.userId, job.id);
        throw error;
      }

      // 3. Selector Mismatch (HTTP 200 OK, but layout changed): Self-Healing state machine
      if (error instanceof SelectorMismatchError) {
        const newFailureCount = job.failureCount + 1;

        if (
          newFailureCount >= this.consecutiveFailuresForHealing &&
          (job.healingWindowStartedAt &&
          Date.now() - job.healingWindowStartedAt.getTime() < env.HEALING_WINDOW_MS
            ? (job.healingAttempts ?? 0)
            : 0) >= this.maxHealingRetries
        ) {
          // Cap maximum self-healing retries to prevent infinite recompilation loops
          await this.jobRepository.updateJob(job.id, {
            status: JobStatus.Failed,
            failureCount: newFailureCount,
            lastError: `Self-healing retry limit exceeded (${this.maxHealingRetries}): ${userMessage}`,
          });
          await this.jobScheduler.removeRepeatableJob(job.id, job.bullmqRepeatableKey);
          logger.warn('Job exceeded max self-healing retries and transitioned to FAILED', {
            jobId: job.id,
            failureCount: newFailureCount,
          });
          await this.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Failed);
          return null;
        }

        if (newFailureCount >= this.consecutiveFailuresForHealing) {
          await this.jobRepository.updateJob(job.id, {
            status: JobStatus.Healing,
            healingAttempts:
              (job.healingWindowStartedAt &&
              Date.now() - job.healingWindowStartedAt.getTime() < env.HEALING_WINDOW_MS
                ? (job.healingAttempts ?? 0)
                : 0) + 1,
            healingWindowStartedAt:
              job.healingWindowStartedAt &&
              Date.now() - job.healingWindowStartedAt.getTime() < env.HEALING_WINDOW_MS
                ? job.healingWindowStartedAt
                : new Date(),
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
          await this.jobScheduler.enqueueCompilation(job.id, 'healing');
          await this.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Healing);
          return null;
        }

        // First selector failure: keep ACTIVE, increment failureCount
        await this.jobRepository.updateJob(job.id, {
          status: JobStatus.Active,
          failureCount: newFailureCount,
          lastError: userMessage,
        });
        await this.realtimeService?.notifyJobUpdated(job.userId, job.id, JobStatus.Active);
        return null;
      }

      // Unexpected errors: record lastError
      await this.jobRepository.updateJob(job.id, {
        lastError: userMessage,
      });
      await this.realtimeService?.notifyJobUpdated(job.userId, job.id);
      throw error;
    }
  }
}
