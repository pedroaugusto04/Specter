import { randomUUID } from 'node:crypto';
import type { SemanticPolicy } from '../extraction/contracts.js';
import { comparisonPayload } from '../utils/planExtraction.js';
import { extractionPlanSchema } from '../types/extractionPlan.js';
import { logger } from '../utils/logger.js';
import {
  AntiBotBlockedError,
  NavigationTimeoutError,
  NotFoundError,
  ValidationError,
} from '../errors/domainErrors.js';
import { JobMapper, type JobRunDto, type ScrapingJobDto } from '../mappers/jobMapper.js';
import type { IScraperEngine } from '../providers/scraping/scraper.interface.js';
import type { IJobScheduler } from '../queues/scheduler.interface.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type {
  DashboardStats,
  IJobRepository,
  UpdateJobPatch,
} from '../repositories/jobRepository.js';
import type { DiffSummary } from '../types/domain.js';
import { JobStatus, RunStatus, TriggerMatchMode } from '../types/enums.js';
import type { TriggerRule } from '../types/extractionPlan.js';
import { validateCronFrequency } from '../utils/cronValidator.js';
import { buildDiffSummary } from '../utils/diffHasher.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';
import { assertSafeUrl } from '../utils/ssrfValidator.js';

export interface CreateScrapingJobRequest {
  userId?: string;
  url: string;
  userPrompt: string;
  notificationEmail?: string;
  webhookUrl?: string | null;
  cronExpression?: string;
  captureScreenshotOnChange?: boolean;
  semanticPolicy?: SemanticPolicy | null;
}

export interface UpdateScrapingJobRequest {
  url?: string;
  userPrompt?: string;
  notificationEmail?: string;
  webhookUrl?: string | null;
  cronExpression?: string;
  captureScreenshotOnChange?: boolean;
  semanticPolicy?: SemanticPolicy | null;
  triggerRules?: TriggerRule[];
  triggerMatchMode?: TriggerMatchMode;
}

import type { RealtimeService } from './realtimeService.js';

export class JobService {
  private readonly jobRepository: IJobRepository;
  private readonly jobScheduler: IJobScheduler;
  private readonly scraperEngine?: IScraperEngine;
  private readonly sessionRepository?: ISessionRepository;
  private readonly realtimeService?: RealtimeService;

  constructor(
    jobRepository: IJobRepository,
    jobScheduler: IJobScheduler,
    scraperEngine?: IScraperEngine,
    sessionRepository?: ISessionRepository,
    realtimeService?: RealtimeService
  ) {
    this.jobRepository = jobRepository;
    this.jobScheduler = jobScheduler;
    this.scraperEngine = scraperEngine;
    this.sessionRepository = sessionRepository;
    this.realtimeService = realtimeService;
  }

  async probeUrl(
    targetUrl: string,
    userId?: string
  ): Promise<{ accessible: boolean; reason?: string; hasSavedSession?: boolean }> {
    let normalizedUrl: string;
    try {
      normalizedUrl = await assertSafeUrl(targetUrl, 'url');
    } catch (ssrfErr) {
      const reason =
        ssrfErr instanceof ValidationError
          ? ssrfErr.message
          : 'Access to private, loopback, or internal network addresses is forbidden.';
      return { accessible: false, reason };
    }

    if (!this.scraperEngine) {
      return { accessible: true };
    }

    const storageState = await resolveSessionStorageState(
      this.sessionRepository,
      userId,
      normalizedUrl
    );
    const hasSavedSession = Boolean(storageState);

    try {
      await this.scraperEngine.fetchHtml(normalizedUrl, { timeoutMs: 8000, storageState });
      return { accessible: true, ...(hasSavedSession ? { hasSavedSession: true } : {}) };
    } catch (err) {
      logger.warn('URL accessibility verification failed during probe', {
        url: normalizedUrl,
        internalError: err instanceof Error ? err.message : String(err),
      });

      if (err instanceof AntiBotBlockedError) {
        return {
          accessible: false,
          reason:
            'This website is currently protected by automated security checks (Anti-Bot / CAPTCHA) or taking too long to respond. Please verify the URL or try again in a few moments.',
        };
      }
      if (err instanceof NavigationTimeoutError) {
        return {
          accessible: false,
          reason:
            'The target website took too long to respond during verification. Please try again in a few moments.',
        };
      }
      return {
        accessible: false,
        reason:
          'Unable to verify target website accessibility. Please verify the URL and try again.',
      };
    }
  }

  async createJob(request: CreateScrapingJobRequest): Promise<ScrapingJobDto> {
    const normalizedUrl = await assertSafeUrl(request.url, 'url');
    const webhookUrl = request.webhookUrl?.trim()
      ? await assertSafeUrl(request.webhookUrl.trim(), 'webhookUrl')
      : null;
    const cronExpression = (request.cronExpression ?? '0 */6 * * *').trim();

    const cronCheck = validateCronFrequency(cronExpression);
    if (!cronCheck.valid) {
      const msg =
        cronCheck.error ??
        'Invalid cron expression or frequency lower than minimum allowed floor of 15 minutes.';
      throw new ValidationError(msg, [{ field: 'cronExpression', message: msg }]);
    }

    const createdEntity = await this.jobRepository.createJob({
      userId: request.userId ?? 'default-user',
      url: normalizedUrl,
      userPrompt: request.userPrompt.trim(),
      notificationEmail: (request.notificationEmail ?? '').trim(),
      webhookUrl,
      cronExpression,
      captureScreenshotOnChange: request.captureScreenshotOnChange ?? false,
      semanticPolicy: request.semanticPolicy ?? null,
    });

    await this.jobScheduler.enqueueCompilation(createdEntity.id, 'initial');

    await this.realtimeService?.notifyJobCreated(
      createdEntity.userId,
      createdEntity.id,
      createdEntity.status
    );

    logger.info('Created new scraping job and enqueued initial compilation', {
      jobId: createdEntity.id,
      url: createdEntity.url,
      userId: createdEntity.userId,
    });

    return JobMapper.entityToDto(createdEntity);
  }

  async listJobs(statusFilter?: JobStatus, userId?: string): Promise<ScrapingJobDto[]> {
    const entities = await this.jobRepository.findAll(statusFilter, userId);
    return entities.map(JobMapper.entityToDto);
  }

  async getJobById(id: string, userId?: string): Promise<ScrapingJobDto> {
    const entity = await this.jobRepository.findById(id);
    if (!entity || (userId && entity.userId !== userId)) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }
    return JobMapper.entityToDto(entity);
  }

  async updateJob(
    id: string,
    request: UpdateScrapingJobRequest,
    userId?: string
  ): Promise<ScrapingJobDto> {
    const existing = await this.jobRepository.findById(id);
    if (!existing || (userId && existing.userId !== userId)) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    const patch: UpdateJobPatch = {};

    if (request.url !== undefined) {
      patch.url = await assertSafeUrl(request.url, 'url');
    }
    if (request.userPrompt !== undefined) {
      patch.userPrompt = request.userPrompt.trim();
    }
    if (request.notificationEmail !== undefined) {
      patch.notificationEmail = request.notificationEmail.trim();
    }
    if (request.webhookUrl !== undefined) {
      patch.webhookUrl = request.webhookUrl?.trim()
        ? await assertSafeUrl(request.webhookUrl.trim(), 'webhookUrl')
        : null;
    }
    if (request.captureScreenshotOnChange !== undefined) {
      patch.captureScreenshotOnChange = request.captureScreenshotOnChange;
    }
    if (request.cronExpression !== undefined) {
      const trimmedCron = request.cronExpression.trim();
      const cronCheck = validateCronFrequency(trimmedCron);
      if (!cronCheck.valid) {
        const msg =
          cronCheck.error ??
          'Invalid cron expression or frequency lower than minimum allowed floor of 15 minutes.';
        throw new ValidationError(msg, [{ field: 'cronExpression', message: msg }]);
      }
      patch.cronExpression = trimmedCron;
    }

    if (request.triggerRules !== undefined || request.triggerMatchMode !== undefined) {
      if (existing.extractionPlan) {
        patch.extractionPlan = {
          ...existing.extractionPlan,
          intent: {
            ...existing.extractionPlan.intent,
            ...(request.triggerRules !== undefined ? { triggerRules: request.triggerRules } : {}),
            ...(request.triggerMatchMode !== undefined
              ? { triggerMatchMode: request.triggerMatchMode }
              : {}),
          },
        };
      }
    }

    if (request.semanticPolicy !== undefined) patch.semanticPolicy = request.semanticPolicy;
    if (patch.extractionPlan) patch.contractRevision = randomUUID();

    const needsRecompile =
      (patch.url !== undefined && patch.url !== existing.url) ||
      (patch.userPrompt !== undefined && patch.userPrompt !== existing.userPrompt);

    if (needsRecompile) {
      if (existing.bullmqRepeatableKey) {
        await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      }
      patch.bullmqRepeatableKey = null;
    } else if (patch.cronExpression !== undefined && existing.status === JobStatus.Active) {
      await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      patch.bullmqRepeatableKey = await this.jobScheduler.scheduleRepeatableJob(
        existing.id,
        patch.cronExpression
      );
    }

    if (patch.extractionPlan)
      patch.extractionPlan = extractionPlanSchema.parse(patch.extractionPlan);
    const updated = await this.jobRepository.updateJob(id, patch);
    if (!updated) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    if (needsRecompile) {
      await this.jobRepository.updateJob(id, {
        status: JobStatus.PendingCompilation,
        extractionPlan: null,
        failureCount: 0,
        lastError: null,
      });
      await this.jobScheduler.enqueueCompilation(id, 'manual');
    }

    const finalEntity = await this.jobRepository.findById(id);
    const resultDto = JobMapper.entityToDto(finalEntity ?? updated);
    await this.realtimeService?.notifyJobUpdated(resultDto.userId, resultDto.id, resultDto.status);
    return resultDto;
  }

  async setJobPauseState(id: string, paused: boolean, userId?: string): Promise<ScrapingJobDto> {
    const existing = await this.jobRepository.findById(id);
    if (!existing || (userId && existing.userId !== userId)) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    if (paused) {
      if (existing.bullmqRepeatableKey) {
        await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      }
      const updated = await this.jobRepository.updateJob(id, {
        status: JobStatus.Paused,
        bullmqRepeatableKey: null,
      });
      const resultDto = JobMapper.entityToDto(updated ?? existing);
      await this.realtimeService?.notifyJobUpdated(
        resultDto.userId,
        resultDto.id,
        resultDto.status
      );
      return resultDto;
    }

    if (!existing.extractionPlan) {
      const updated = await this.jobRepository.updateJob(id, {
        status: JobStatus.PendingCompilation,
      });
      await this.jobScheduler.enqueueCompilation(existing.id, 'manual');
      const resultDto = JobMapper.entityToDto(updated ?? existing);
      await this.realtimeService?.notifyJobUpdated(
        resultDto.userId,
        resultDto.id,
        resultDto.status
      );
      return resultDto;
    }

    const repeatableKey = await this.jobScheduler.scheduleRepeatableJob(
      existing.id,
      existing.cronExpression
    );
    const updated = await this.jobRepository.updateJob(id, {
      status: JobStatus.Active,
      bullmqRepeatableKey: repeatableKey,
    });
    const resultDto = JobMapper.entityToDto(updated ?? existing);
    await this.realtimeService?.notifyJobUpdated(resultDto.userId, resultDto.id, resultDto.status);
    return resultDto;
  }

  async triggerManualScrape(
    id: string,
    userId?: string
  ): Promise<{ queued: boolean; mode: 'scrape' | 'compile' }> {
    const existing = await this.jobRepository.findById(id);
    if (!existing || (userId && existing.userId !== userId)) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    if (!existing.extractionPlan || existing.status === JobStatus.PendingCompilation) {
      await this.jobScheduler.enqueueCompilation(existing.id, 'manual');
      await this.realtimeService?.notifyJobUpdated(existing.userId, existing.id, existing.status);
      return { queued: true, mode: 'compile' };
    }

    await this.jobScheduler.enqueueImmediateScrape(existing.id);
    await this.realtimeService?.notifyJobUpdated(existing.userId, existing.id, existing.status);
    return { queued: true, mode: 'scrape' };
  }

  async triggerManualRecompile(id: string, userId?: string): Promise<ScrapingJobDto> {
    const existing = await this.jobRepository.findById(id);
    if (!existing || (userId && existing.userId !== userId)) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    const updated = await this.jobRepository.updateJob(id, {
      status: JobStatus.Healing,
      failureCount: 0,
      lastError: null,
    });

    await this.jobScheduler.enqueueCompilation(existing.id, 'manual');
    const resultDto = JobMapper.entityToDto(updated ?? existing);
    await this.realtimeService?.notifyJobUpdated(resultDto.userId, resultDto.id, resultDto.status);
    return resultDto;
  }

  async deleteJob(id: string, userId?: string): Promise<void> {
    const existing = await this.jobRepository.findById(id);
    if (!existing || (userId && existing.userId !== userId)) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
    await this.jobRepository.deleteJob(id);
    await this.realtimeService?.notifyJobDeleted(existing.userId, existing.id);
  }

  async getJobRuns(
    jobId: string,
    limit = 50,
    userId?: string
  ): Promise<{ runs: JobRunDto[]; latestDiff: DiffSummary | null }> {
    const existing = await this.jobRepository.findById(jobId);
    if (!existing || (userId && existing.userId !== userId)) {
      throw new NotFoundError(`Monitoring job not found: ${jobId}`);
    }

    const runEntities = await this.jobRepository.findRunsByJobId(jobId, limit);
    const runs = runEntities.map(JobMapper.runEntityToDto);

    const successfulRuns = runEntities.filter(
      (r) =>
        r.status === RunStatus.Success &&
        r.extractedData &&
        r.extractionReport &&
        r.contractRevision === existing.contractRevision
    );
    let latestDiff: DiffSummary | null = null;

    if (successfulRuns.length >= 2) {
      const current = successfulRuns[0]!;
      const previous = successfulRuns[1]!;
      latestDiff = buildDiffSummary(
        comparisonPayload(
          previous.extractedData!,
          existing.extractionPlan?.intent.identityFields ?? []
        ),
        comparisonPayload(
          current.extractedData!,
          existing.extractionPlan?.intent.identityFields ?? []
        ),
        false
      );
    }

    return { runs, latestDiff };
  }

  async getDashboardStats(userId?: string): Promise<DashboardStats> {
    return this.jobRepository.getStats(userId);
  }
}
