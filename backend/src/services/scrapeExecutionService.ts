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
import type { ChangeStatus, JobRunEntity } from '../types/domain.js';
import { buildDiffSummary, computeNormalizedHash } from '../utils/diffHasher.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { extractUsingConfig, isExtractedPayloadEmpty } from '../utils/extractorEngine.js';
import { logger } from '../utils/logger.js';
import { evaluateAndDispatchChangeAlert } from '../utils/changeAlertHelper.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';

export interface ScrapeExecutionServiceDeps {
  jobRepository: IJobRepository;
  scraperEngine: IScraperEngine;
  notificationProvider: INotificationProvider;
  jobScheduler: IJobScheduler;
  storageProvider?: IStorageProvider;
  sessionRepository?: ISessionRepository;
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
  private readonly consecutiveFailuresForHealing: number;
  private readonly maxHealingRetries: number;

  constructor(deps: ScrapeExecutionServiceDeps) {
    this.jobRepository = deps.jobRepository;
    this.scraperEngine = deps.scraperEngine;
    this.notificationProvider = deps.notificationProvider;
    this.jobScheduler = deps.jobScheduler;
    this.storageProvider = deps.storageProvider ?? createStorageProvider();
    this.sessionRepository = deps.sessionRepository;
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

    if (job.status === 'PAUSED') {
      logger.info('Skipping scrape execution for PAUSED job', { jobId: job.id });
      return null;
    }

    if (!job.extractorConfig) {
      logger.info('Job has no extractorConfig; enqueueing compilation', { jobId: job.id });
      await this.jobScheduler.enqueueCompilation(job.id, 'initial');
      return null;
    }

    let httpStatus: number | null = null;

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

      const scrapeResult = await this.scraperEngine.fetchHtml(job.url, {
        waitForSelector: job.extractorConfig.containerSelector,
        storageState,
        captureScreenshot: job.captureScreenshotOnChange,
      });
      httpStatus = scrapeResult.httpStatus;

      const extractedData = extractUsingConfig(scrapeResult.rawHtml, job.extractorConfig);

      if (isExtractedPayloadEmpty(extractedData)) {
        throw new SelectorMismatchError(
          'No data could be extracted with the current selectors.'
        );
      }

      const currentHash = computeNormalizedHash(extractedData);
      const previousRun = await this.jobRepository.findLatestSuccessfulRun(job.id);

      let hasChanges: ChangeStatus = 'INITIAL';
      if (previousRun) {
        hasChanges = previousRun.normalizedHash === currentHash ? 'NO' : 'YES';
      }

      let screenshotUrl: string | null = null;
      if (hasChanges === 'YES' && scrapeResult.screenshot && this.storageProvider.isEnabled) {
        try {
          const runTimestamp = Date.now();
          const storageKey = `jobs/${job.id}/${runTimestamp}.jpg`;
          const uploadRes = await this.storageProvider.upload(
            storageKey,
            scrapeResult.screenshot,
            'image/jpeg'
          );
          screenshotUrl = uploadRes.publicUrl;
        } catch (uploadErr) {
          logger.error('Failed to upload screenshot to Supabase Storage', {
            jobId: job.id,
            error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
          });
        }
      }

      const durationMs = Date.now() - startTime;

      const runRecord = await this.jobRepository.createRun({
        jobId: job.id,
        extractedData,
        normalizedHash: currentHash,
        hasChanges,
        status: 'SUCCESS',
        httpStatus,
        durationMs,
        screenshotUrl,
      });

      // Reset failure counter and ensure ACTIVE status on successful run
      if (job.failureCount > 0 || job.lastError !== null || job.status !== 'ACTIVE') {
        await this.jobRepository.updateJob(job.id, {
          status: 'ACTIVE',
          failureCount: 0,
          lastError: null,
        });
      }

      // Send notification only when actual changes occur compared to a prior snapshot
      if (hasChanges === 'YES' && previousRun) {
        await evaluateAndDispatchChangeAlert({
          job,
          currentData: extractedData,
          previousData: previousRun.extractedData,
          triggerRules: job.extractorConfig?.triggerRules,
          triggerMatchMode: job.extractorConfig?.triggerMatchMode,
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

      const userMessage = formatUserErrorMessage(error);

      await this.jobRepository.createRun({
        jobId: job.id,
        extractedData: null,
        normalizedHash: null,
        hasChanges: 'NO',
        status: 'FAILED',
        errorMessage: userMessage,
        httpStatus,
        durationMs,
      });

      // 1. Anti-bot / WAF block (HTTP 403/429): DO NOT trigger layout self-healing
      if (error instanceof AntiBotBlockedError) {
        await this.jobRepository.updateJob(job.id, {
          lastError: userMessage,
        });
        return null;
      }

      // 2. Navigation / Network Timeout: DO NOT recompile; rethrow for BullMQ exponential backoff
      if (error instanceof NavigationTimeoutError) {
        await this.jobRepository.updateJob(job.id, {
          lastError: userMessage,
        });
        throw error;
      }

      // 3. Selector Mismatch (HTTP 200 OK, but layout changed): Self-Healing state machine
      if (error instanceof SelectorMismatchError) {
        const newFailureCount = job.failureCount + 1;

        if (newFailureCount > this.maxHealingRetries) {
          // Cap maximum self-healing retries to prevent infinite recompilation loops
          await this.jobRepository.updateJob(job.id, {
            status: 'FAILED',
            failureCount: newFailureCount,
            lastError: `Self-healing retry limit exceeded (${this.maxHealingRetries}): ${userMessage}`,
          });
          logger.warn('Job exceeded max self-healing retries and transitioned to FAILED', {
            jobId: job.id,
            failureCount: newFailureCount,
          });
          return null;
        }

        if (newFailureCount >= this.consecutiveFailuresForHealing) {
          await this.jobRepository.updateJob(job.id, {
            status: 'HEALING',
            failureCount: newFailureCount,
            lastError: userMessage,
          });
          logger.info('Consecutive selector mismatches reached threshold; transitioning to HEALING', {
            jobId: job.id,
            failureCount: newFailureCount,
          });
          await this.jobScheduler.enqueueCompilation(job.id, 'healing');
          return null;
        }

        // First selector failure: keep ACTIVE, increment failureCount
        await this.jobRepository.updateJob(job.id, {
          status: 'ACTIVE',
          failureCount: newFailureCount,
          lastError: userMessage,
        });
        return null;
      }

      // Unexpected errors: record lastError
      await this.jobRepository.updateJob(job.id, {
        lastError: userMessage,
      });
      throw error;
    }
  }
}
