import { CompilerValidationError, DomainError, NotFoundError } from '../errors/domainErrors.js';
import type { ICompilerProvider } from '../providers/compilers/compiler.interface.js';
import type { INotificationProvider } from '../providers/notifications/notification.interface.js';
import type { IScraperEngine } from '../providers/scraping/scraper.interface.js';
import type { IJobScheduler } from '../queues/scheduler.interface.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { ChangeStatus, ScrapingJobEntity } from '../types/domain.js';
import { buildDiffSummary, computeNormalizedHash } from '../utils/diffHasher.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { validateExtractionSmokeTest } from '../utils/extractorEngine.js';
import { sanitizeHtml } from '../utils/htmlSanitizer.js';
import { logger } from '../utils/logger.js';
import { evaluateAndDispatchChangeAlert } from '../utils/changeAlertHelper.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';
import type { RealtimeService } from './realtimeService.js';

export interface CompilationServiceDeps {
  jobRepository: IJobRepository;
  scraperEngine: IScraperEngine;
  compilerProvider: ICompilerProvider;
  notificationProvider: INotificationProvider;
  jobScheduler: IJobScheduler;
  sessionRepository?: ISessionRepository;
  realtimeService?: RealtimeService;
}

export class CompilationService {
  private readonly jobRepository: IJobRepository;
  private readonly scraperEngine: IScraperEngine;
  private readonly compilerProvider: ICompilerProvider;
  private readonly notificationProvider: INotificationProvider;
  private readonly jobScheduler: IJobScheduler;
  private readonly sessionRepository?: ISessionRepository;
  private readonly realtimeService?: RealtimeService;

  constructor(deps: CompilationServiceDeps) {
    this.jobRepository = deps.jobRepository;
    this.scraperEngine = deps.scraperEngine;
    this.compilerProvider = deps.compilerProvider;
    this.notificationProvider = deps.notificationProvider;
    this.jobScheduler = deps.jobScheduler;
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
      const scrapeResult = await this.scraperEngine.fetchHtml(job.url, { storageState });
      httpStatus = scrapeResult.httpStatus;

      // 2. Sanitize DOM and prune repeated sibling nodes before forwarding to AI
      const sanitizedHtml = sanitizeHtml(scrapeResult.rawHtml);

      // 3. Compile extractor schema via pluggable AI Compiler Provider
      const compiledSchema = await this.compilerProvider.compile({
        jobId: job.id,
        sanitizedHtml,
        userPrompt: job.userPrompt,
      });

      // 4. Pre-activation smoke test against sanitized DOM
      const smokeTest = validateExtractionSmokeTest(sanitizedHtml, compiledSchema);
      if (!smokeTest.valid) {
        throw new CompilerValidationError(
          smokeTest.reason ?? 'Smoke-test failed: compiled selectors returned empty extraction.'
        );
      }

      // 5. Compute hash and record initial/healing snapshot
      const normalizedHash = computeNormalizedHash(smokeTest.extractedData);
      const previousRun = await this.jobRepository.findLatestSuccessfulRun(job.id);

      let hasChanges: ChangeStatus = 'INITIAL';
      if (previousRun) {
        hasChanges = previousRun.normalizedHash === normalizedHash ? 'NO' : 'YES';
      }

      const durationMs = Date.now() - startTime;

      await this.jobRepository.createRun({
        jobId: job.id,
        extractedData: smokeTest.extractedData,
        normalizedHash,
        hasChanges,
        status: 'SUCCESS',
        httpStatus,
        durationMs,
      });

      if (hasChanges === 'YES' && previousRun) {
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
        extractorConfig: compiledSchema,
        status: 'ACTIVE',
        lastError: null,
        failureCount: 0,
        bullmqRepeatableKey: repeatableKey,
      });

      logger.info('Job compilation and smoke-test succeeded; job is now ACTIVE', {
        jobId: job.id,
        durationMs,
        provider: this.compilerProvider.name,
      });

      await this.realtimeService?.notifyJobUpdated(job.userId, job.id, 'ACTIVE');

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

      await this.jobRepository.updateJob(job.id, {
        status: 'FAILED',
        lastError: userMessage,
      });

      await this.realtimeService?.notifyJobUpdated(job.userId, job.id, 'FAILED');

      throw error;
    }
  }
}
