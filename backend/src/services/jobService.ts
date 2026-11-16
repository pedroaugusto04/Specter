import { JobPresenter } from '../presentation/jobPresenter.js';
import { DashboardMapper } from '../mappers/dashboardMapper.js';
import type { CreateJobRequest, UpdateJobRequest } from '@specter/contracts';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { randomUUID } from 'node:crypto';
import { comparisonPayload } from '../extraction/comparison.js';
import { extractionPlanSchema } from '../types/extractionPlan.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, ValidationError } from '../errors/domainErrors.js';
import { JobMapper } from '../mappers/jobMapper.js';
import type {
  JobRunsDto,
  JobTimeseriesDto,
  ScrapingJobDto,
  TimeseriesRange,
} from '@specter/contracts';
import type { IScraperEngine } from '../providers/scraping/scraper.interface.js';
import { CompilationReason, type IJobScheduler } from '../queues/scheduler.interface.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type {
  DashboardStats,
  IJobRepository,
  UpdateJobPatch,
} from '../repositories/jobRepository.js';
import type { DiffSummary, ScrapingJobEntity } from '../types/domain.js';
import { JobStatus, RunStatus } from '../types/enums.js';
import { validateCronFrequency } from '../utils/cronValidator.js';
import { buildDiffSummary } from '../utils/diffHasher.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';
import { assertSafeUrl } from '../utils/ssrfValidator.js';

export interface CreateScrapingJobRequest extends CreateJobRequest {
  userId: string;
}
export type UpdateScrapingJobRequest = UpdateJobRequest;

import type { RealtimeService } from './realtimeService.js';
import type { QuotaService } from './quotaService.js';
import type { ICompilationControl } from './compilationControl.interface.js';

export interface JobServiceDeps {
  jobRepository: IJobRepository;
  jobScheduler: IJobScheduler;
  compilationControl: ICompilationControl;
  scraperEngine?: IScraperEngine;
  sessionRepository?: ISessionRepository;
  realtimeService?: RealtimeService;
  presenter?: JobPresenter;
  quotaService?: QuotaService;
}

export class JobService {
  private readonly jobRepository: IJobRepository;
  private readonly jobScheduler: IJobScheduler;
  private readonly scraperEngine?: IScraperEngine;
  private readonly sessionRepository?: ISessionRepository;
  private readonly realtimeService?: RealtimeService;
  private readonly quotaService?: QuotaService;
  private readonly compilationControl: ICompilationControl;

  private readonly presenter: JobPresenter;

  constructor(deps: JobServiceDeps) {
    this.jobRepository = deps.jobRepository;
    this.jobScheduler = deps.jobScheduler;
    this.compilationControl = deps.compilationControl;
    this.scraperEngine = deps.scraperEngine;
    this.sessionRepository = deps.sessionRepository;
    this.realtimeService = deps.realtimeService;
    this.presenter = deps.presenter ?? new JobPresenter(undefined, deps.jobRepository);
    this.quotaService = deps.quotaService;
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
      return {
        accessible: false,
        reason: formatUserErrorMessage(new Error('Acquisition adapter unavailable.')),
      };
    }

    const storageState = await resolveSessionStorageState(
      this.sessionRepository,
      userId,
      normalizedUrl
    );
    const hasSavedSession = Boolean(storageState);

    try {
      await this.scraperEngine.fetchHtml(normalizedUrl, { storageState });
      return { accessible: true, ...(hasSavedSession ? { hasSavedSession: true } : {}) };
    } catch (err) {
      logger.warn('URL accessibility verification failed during probe', {
        url: normalizedUrl,
        internalError: err instanceof Error ? err.message : String(err),
      });

      return {
        accessible: false,
        reason: formatUserErrorMessage(err),
        ...(hasSavedSession ? { hasSavedSession: true } : {}),
      };
    }
  }

  async createJob(request: CreateScrapingJobRequest): Promise<ScrapingJobDto> {
    const normalizedUrl = await assertSafeUrl(request.url, 'url');
    const webhookUrl = request.webhookUrl?.trim()
      ? await assertSafeUrl(request.webhookUrl.trim(), 'webhookUrl')
      : null;
    const cronExpression = this.assertValidCron(request.cronExpression ?? '0 */6 * * *');

    const existingJobs = await this.jobRepository.findAll(undefined, request.userId);
    const name = request.name?.trim() || this.nextMonitorName(existingJobs.map((job) => job.name));
    this.assertUniqueMonitorName(
      name,
      existingJobs.map((job) => job.name)
    );

    if (this.quotaService && request.userId) {
      await this.quotaService.assertCanActivateMonitor(request.userId);
      await this.quotaService.assertCanCompile(request.userId);
    }

    const createdEntity = await this.jobRepository.createJob({
      userId: request.userId,
      name,
      url: normalizedUrl,
      userPrompt: request.userPrompt.trim(),
      notificationEmail: request.notificationEmail?.trim() || null,
      webhookUrl,
      webhookSecret: request.webhookSecret?.trim() || null,
      cronExpression,
      captureScreenshotOnChange: request.captureScreenshotOnChange ?? false,
    });

    await this.jobScheduler.enqueueCompilation(createdEntity.id, CompilationReason.Initial);

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

    return await this.presenter.present(createdEntity);
  }

  async listJobs(statusFilter?: JobStatus, userId?: string): Promise<ScrapingJobDto[]> {
    const entities = await this.jobRepository.findAll(statusFilter, userId);
    return Promise.all(entities.map((entity) => this.presenter.present(entity)));
  }

  async getJobById(id: string, userId?: string): Promise<ScrapingJobDto> {
    const entity = await this.getOwnedJob(id, userId);
    return this.presenter.present(entity);
  }

  async updateJob(
    id: string,
    request: UpdateScrapingJobRequest,
    userId?: string
  ): Promise<ScrapingJobDto> {
    const existing = await this.getOwnedJob(id, userId);

    const patch: UpdateJobPatch = {};

    if (request.name !== undefined) {
      const name = request.name.trim();
      const existingNames = (await this.jobRepository.findAll(undefined, existing.userId))
        .filter((job) => job.id !== id)
        .map((job) => job.name);
      this.assertUniqueMonitorName(name, existingNames);
      patch.name = name;
    }

    if (request.url !== undefined) {
      patch.url = await assertSafeUrl(request.url, 'url');
    }
    if (request.userPrompt !== undefined) {
      patch.userPrompt = request.userPrompt.trim();
    }
    if (request.notificationEmail !== undefined) {
      patch.notificationEmail = request.notificationEmail?.trim() || null;
    }
    if (request.webhookUrl !== undefined) {
      patch.webhookUrl = request.webhookUrl?.trim()
        ? await assertSafeUrl(request.webhookUrl.trim(), 'webhookUrl')
        : null;
    }
    if (request.webhookSecret !== undefined) {
      patch.webhookSecret = request.webhookSecret?.trim() || null;
    }
    if (request.captureScreenshotOnChange !== undefined) {
      patch.captureScreenshotOnChange = request.captureScreenshotOnChange;
    }
    if (request.cronExpression !== undefined) {
      patch.cronExpression = this.assertValidCron(request.cronExpression);
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

    if (patch.extractionPlan) {
      const validated = extractionPlanSchema.safeParse(patch.extractionPlan);
      if (!validated.success)
        throw new ValidationError(
          'Invalid trigger configuration.',
          validated.error.issues.map((issue) => ({ field: 'triggerRules', message: issue.message }))
        );
      patch.extractionPlan = validated.data;
      patch.contractRevision = randomUUID();
    }

    const needsRecompile =
      (patch.url !== undefined && patch.url !== existing.url) ||
      (patch.userPrompt !== undefined && patch.userPrompt !== existing.userPrompt);

    if (needsRecompile) {
      await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      patch.bullmqRepeatableKey = null;
      patch.status = JobStatus.PendingCompilation;
      patch.extractionPlan = null;
      patch.lastError = null;
    } else if (patch.cronExpression !== undefined && existing.status === JobStatus.Active) {
      await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      patch.bullmqRepeatableKey = await this.jobScheduler.scheduleRepeatableJob(
        existing.id,
        patch.cronExpression
      );
    }

    const updated = await this.jobRepository.updateJob(id, patch);
    if (!updated) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    if (needsRecompile) {
      await this.jobScheduler.enqueueCompilation(id, CompilationReason.Manual);
    }

    const resultDto = await this.presenter.present(updated);
    await this.realtimeService?.notifyJobUpdated(existing.userId, resultDto.id, resultDto.status);
    return resultDto;
  }

  private async getOwnedJob(id: string, userId?: string): Promise<ScrapingJobEntity> {
    const entity = await this.jobRepository.findById(id);
    if (!entity || (userId && entity.userId !== userId)) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }
    return entity;
  }

  private assertValidCron(cronExpression: string): string {
    const trimmed = cronExpression.trim();
    const cronCheck = validateCronFrequency(trimmed);
    if (!cronCheck.valid) {
      const msg =
        cronCheck.error ??
        'Invalid cron expression or frequency lower than minimum allowed floor of 15 minutes.';
      throw new ValidationError(msg, [{ field: 'cronExpression', message: msg }]);
    }
    return trimmed;
  }

  private nextMonitorName(existingNames: string[]): string {
    const names = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
    let index = 1;
    while (names.has(`monitor ${index}`)) index += 1;
    return `Monitor ${index}`;
  }

  private assertUniqueMonitorName(name: string, existingNames: string[]): void {
    if (
      existingNames.some(
        (existing) => existing.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
      )
    ) {
      const message = 'A monitor with this name already exists. Choose a unique name.';
      throw new ValidationError(message, [{ field: 'name', message }]);
    }
  }

  async setJobPauseState(id: string, paused: boolean, userId?: string): Promise<ScrapingJobDto> {
    const existing = await this.getOwnedJob(id, userId);

    if (paused) {
      this.compilationControl.cancelCompilation(existing.id, 'Monitor paused by user');
      await this.jobScheduler.removePendingCompilations(existing.id);
      await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      const updated = await this.jobRepository.updateJob(id, {
        status: JobStatus.Paused,
        bullmqRepeatableKey: null,
      });
      const resultDto = await this.presenter.present(updated ?? existing);
      await this.realtimeService?.notifyJobUpdated(existing.userId, resultDto.id, resultDto.status);
      return resultDto;
    }

    if (this.quotaService && existing.userId && existing.status === JobStatus.Paused) {
      await this.quotaService.assertCanActivateMonitor(existing.userId);
      if (!existing.extractionPlan) {
        await this.quotaService.assertCanCompile(existing.userId);
      }
    }

    if (!existing.extractionPlan) {
      const updated = await this.jobRepository.updateJob(id, {
        status: JobStatus.PendingCompilation,
      });
      await this.jobScheduler.enqueueCompilation(existing.id, CompilationReason.Manual);
      const resultDto = await this.presenter.present(updated ?? existing);
      await this.realtimeService?.notifyJobUpdated(existing.userId, resultDto.id, resultDto.status);
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
    const resultDto = await this.presenter.present(updated ?? existing);
    await this.realtimeService?.notifyJobUpdated(existing.userId, resultDto.id, resultDto.status);
    return resultDto;
  }

  async triggerManualScrape(
    id: string,
    userId?: string
  ): Promise<{ queued: boolean; mode: 'scrape' | 'compile' }> {
    const existing = await this.getOwnedJob(id, userId);

    if (!existing.extractionPlan || existing.status === JobStatus.PendingCompilation) {
      await this.jobScheduler.enqueueCompilation(existing.id, CompilationReason.Manual);
      await this.realtimeService?.notifyJobUpdated(existing.userId, existing.id, existing.status);
      return { queued: true, mode: 'compile' };
    }

    await this.jobScheduler.enqueueImmediateScrape(existing.id);
    await this.realtimeService?.notifyJobUpdated(existing.userId, existing.id, existing.status);
    return { queued: true, mode: 'scrape' };
  }

  async triggerManualRecompile(id: string, userId?: string): Promise<ScrapingJobDto> {
    const existing = await this.getOwnedJob(id, userId);

    const updated = await this.jobRepository.updateJob(id, {
      status: JobStatus.Recovering,
      lastError: null,
    });

    await this.jobScheduler.enqueueCompilation(existing.id, CompilationReason.Manual);
    const resultDto = await this.presenter.present(updated ?? existing);
    await this.realtimeService?.notifyJobUpdated(existing.userId, resultDto.id, resultDto.status);
    return resultDto;
  }

  async cancelCompilation(id: string, userId?: string): Promise<ScrapingJobDto> {
    const existing = await this.getOwnedJob(id, userId);

    if (
      existing.status !== JobStatus.PendingCompilation &&
      existing.status !== JobStatus.Recovering
    ) {
      throw new ValidationError('This monitor does not have a compilation in progress.');
    }

    this.compilationControl.cancelCompilation(existing.id, 'Compilation cancelled by user');
    await this.jobScheduler.removePendingCompilations(existing.id);

    // If job already had an extraction plan, revert to ACTIVE, otherwise set to PAUSED
    const targetStatus = existing.extractionPlan ? JobStatus.Active : JobStatus.Paused;

    const updated = await this.jobRepository.updateJob(id, {
      status: targetStatus,
      lastError: null,
    });

    const resultDto = await this.presenter.present(updated ?? existing);
    await this.realtimeService?.notifyJobUpdated(existing.userId, resultDto.id, resultDto.status);
    return resultDto;
  }

  async deleteJob(id: string, userId?: string): Promise<void> {
    const existing = await this.getOwnedJob(id, userId);

    this.compilationControl.cancelCompilation(existing.id, 'Monitor deleted by user');
    await this.jobScheduler.removePendingCompilations(existing.id);
    await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
    await this.jobRepository.deleteJob(id);
    await this.realtimeService?.notifyJobDeleted(existing.userId, existing.id);
  }

  async getJobRuns(jobId: string, page = 1, pageSize = 20, userId?: string): Promise<JobRunsDto> {
    const existing = await this.getOwnedJob(jobId, userId);

    const [paginatedResult, summaryStats] = await Promise.all([
      this.jobRepository.findPaginatedRunsByJobId(jobId, page, pageSize),
      this.jobRepository.getJobRunsSummary(jobId),
    ]);

    const { runs: runEntities, totalCount } = paginatedResult;
    const runs = runEntities.map(JobMapper.runEntityToDto);

    const recentRuns = await this.jobRepository.findRunsByJobId(jobId, 5);
    const successfulRuns = recentRuns.filter(
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
        )
      );
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
      runs,
      latestSuccessfulRun: await this.jobRepository
        .findLatestSuccessfulRun(jobId)
        .then((run) => (run ? JobMapper.runEntityToDto(run) : null)),
      latestDiff,
      pagination: {
        page,
        pageSize,
        totalItems: totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      summary: summaryStats,
    };
  }

  async getDashboardStats(userId?: string): Promise<DashboardStats> {
    return DashboardMapper.toDto(await this.jobRepository.getStats(userId));
  }

  async getJobTimeseries(
    jobId: string,
    range: TimeseriesRange = 'all',
    userId?: string
  ): Promise<JobTimeseriesDto> {
    await this.getOwnedJob(jobId, userId);

    const rows = await this.jobRepository.findTimeseriesByJobId(jobId, range);
    const points = rows.map(JobMapper.timeseriesPointToDto);

    return {
      jobId,
      range,
      totalPoints: points.length,
      points,
    };
  }
}
