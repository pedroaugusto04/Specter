import { randomUUID } from 'node:crypto';
import {
  ExtractionScope,
  PAGINATION_RUNS_PAGE_SIZE,
  PAGINATION_TIMESERIES_PAGE_SIZE,
  type CreateJobRequest,
  type DashboardStatsDto,
  type JobPlanVersionsDto,
  type JobRunsDto,
  type JobStatusFilter,
  type JobTimeseriesDto,
  type PaginatedResponse,
  type ProbeUrlDto,
  type ScrapingJobDto,
  type TimeseriesRange,
  type TriggerJobDto,
  type UpdateJobRequest,
} from '@specter/contracts';
import { env } from '../config/env.js';
import {
  CompilationAlreadyInProgressError,
  ExtractionRunInProgressError,
  InvalidCronExpressionError,
  InvalidTriggerConfigurationError,
  JobNotFoundError,
  MonitorNameAlreadyExistsError,
  NoCompilationInProgressError,
  PlanVersionNotFoundError,
  ValidationError,
} from '../errors/domainErrors.js';
import { comparisonPayload } from '../extraction/comparison.js';
import { JobMapper } from '../mappers/jobMapper.js';
import type { JobPresenter } from '../presentation/jobPresenter.js';
import type { IScraperEngine } from '../providers/scraping/scraper.interface.js';
import { CompilationReason, type IJobScheduler } from '../queues/scheduler.interface.js';
import type { IJobRepository, UpdateJobPatch } from '../repositories/jobRepository.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { DiffSummary, ScrapingJobEntity } from '../types/domain.js';
import { JobStatus, RunStatus } from '../types/enums.js';
import { extractionPlanSchema } from '../types/extractionPlan.js';
import { validateCronFrequency } from '../utils/cronValidator.js';
import { buildDiffSummary } from '../utils/diffHasher.js';
import { getErrorMessage } from '../utils/errors.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';
import { logger } from '../utils/logger.js';
import { resolvePageResult } from '../utils/pagination.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';
import { assertSafeUrl } from '../utils/ssrfValidator.js';
import type { ICompilationControl } from './compilationControl.interface.js';
import type { QuotaService } from './quotaService.js';
import type { RealtimeService } from './realtimeService.js';

export interface CreateScrapingJobRequest extends CreateJobRequest {
  userId: string;
}

export interface JobServiceDeps {
  jobRepository: IJobRepository;
  jobScheduler: IJobScheduler;
  compilationControl: ICompilationControl;
  scraperEngine: IScraperEngine;
  sessionRepository: ISessionRepository;
  realtimeService: RealtimeService;
  quotaService: QuotaService;
  presenter: JobPresenter;
}

export class JobService {
  constructor(private readonly deps: JobServiceDeps) {}

  async probeUrl(targetUrl: string, userId?: string): Promise<ProbeUrlDto> {
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

    const storageState = await resolveSessionStorageState(
      this.deps.sessionRepository,
      userId,
      normalizedUrl
    );
    const hasSavedSession = Boolean(storageState);

    try {
      await this.deps.scraperEngine.fetchHtml(normalizedUrl, { storageState });
      return { accessible: true, ...(hasSavedSession ? { hasSavedSession: true } : {}) };
    } catch (err) {
      logger.warn('URL accessibility verification failed during probe', {
        url: normalizedUrl,
        internalError: getErrorMessage(err),
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

    const existingJobs = await this.deps.jobRepository.findAll(undefined, request.userId);
    const existingNames = existingJobs.map((job) => job.name);
    const name = request.name?.trim() || this.nextMonitorName(existingNames);
    this.assertUniqueMonitorName(name, existingNames);

    await this.deps.quotaService.assertCanActivateMonitor(request.userId);
    await this.deps.quotaService.assertCanCompile(request.userId);

    const createdEntity = await this.deps.jobRepository.createJob({
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

    await this.deps.jobScheduler.enqueueCompilation(createdEntity.id, CompilationReason.Initial);
    await this.deps.realtimeService.notifyJobCreated(
      createdEntity.userId,
      createdEntity.id,
      createdEntity.status
    );

    logger.info('Created new scraping job and enqueued initial compilation', {
      jobId: createdEntity.id,
      url: createdEntity.url,
      userId: createdEntity.userId,
    });

    return this.deps.presenter.present(createdEntity);
  }

  async listJobsPage(input: {
    status?: JobStatusFilter;
    userId: string;
    page: number;
    pageSize: number;
    search?: string;
  }): Promise<PaginatedResponse<ScrapingJobDto>> {
    const result = await resolvePageResult(
      input.page,
      input.pageSize,
      await this.deps.jobRepository.findPage(input),
      (page) => this.deps.jobRepository.findPage({ ...input, page })
    );
    return {
      items: await this.deps.presenter.presentMany(result.items),
      pagination: result.pagination,
    };
  }

  async getJobById(id: string, userId?: string): Promise<ScrapingJobDto> {
    const entity = await this.getOwnedJob(id, userId);
    return this.deps.presenter.present(entity);
  }

  async updateJob(
    id: string,
    request: UpdateJobRequest,
    userId?: string
  ): Promise<ScrapingJobDto> {
    const existing = await this.getOwnedJob(id, userId);
    const patch: UpdateJobPatch = {};

    if (request.name !== undefined) {
      const name = request.name.trim();
      const existingNames = (await this.deps.jobRepository.findAll(undefined, existing.userId))
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
      patch.notificationEmail = request.notificationEmail.trim() || null;
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

    if (
      (request.triggerRules !== undefined || request.triggerMatchMode !== undefined) &&
      existing.extractionPlan
    ) {
      const candidatePlan = {
        ...existing.extractionPlan,
        intent: {
          ...existing.extractionPlan.intent,
          ...(request.triggerRules !== undefined ? { triggerRules: request.triggerRules } : {}),
          ...(request.triggerMatchMode !== undefined
            ? { triggerMatchMode: request.triggerMatchMode }
            : {}),
        },
      };
      const validated = extractionPlanSchema.safeParse(candidatePlan);
      if (!validated.success) {
        throw new InvalidTriggerConfigurationError(validated.error.issues);
      }
      patch.extractionPlan = validated.data;
      patch.contractRevision = existing.contractRevision ?? randomUUID();
    }

    const urlChanged = patch.url !== undefined && patch.url !== existing.url;
    const promptChanged =
      patch.userPrompt !== undefined && patch.userPrompt !== existing.userPrompt;
    const needsRecompile = urlChanged || promptChanged;

    if (needsRecompile) {
      const isDomainChange = Boolean(
        urlChanged && this.hasOriginChanged(existing.url, patch.url!)
      );

      if (isDomainChange || !existing.extractionPlan) {
        // Domain changed or no previous plan: old selectors cannot be used as fallback
        await this.deps.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
        patch.bullmqRepeatableKey = null;
        patch.status = JobStatus.PendingCompilation;
        patch.extractionPlan = null;
        patch.lastError = null;
      } else {
        // Safe Shadow Compilation: Keep previous extractionPlan as fallback
        patch.status = JobStatus.Recovering;
        patch.lastError = null;
      }
    } else if (patch.cronExpression !== undefined && existing.status === JobStatus.Active) {
      await this.deps.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      patch.bullmqRepeatableKey = await this.deps.jobScheduler.scheduleRepeatableJob(
        existing.id,
        patch.cronExpression
      );
    }

    const updated = await this.updateOrThrow(id, patch);

    if (needsRecompile) {
      await this.deps.jobScheduler.enqueueCompilation(id, CompilationReason.Manual);
    }

    return this.presentAndNotify(updated);
  }

  async setJobPauseState(id: string, paused: boolean, userId?: string): Promise<ScrapingJobDto> {
    const existing = await this.getOwnedJob(id, userId);

    if (paused) {
      this.deps.compilationControl.cancelCompilation(existing.id, 'Monitor paused by user');
      await this.deps.jobScheduler.removePendingCompilations(existing.id);
      await this.deps.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      const updated = await this.updateOrThrow(id, {
        status: JobStatus.Paused,
        bullmqRepeatableKey: null,
      });
      return this.presentAndNotify(updated);
    }

    if (existing.status === JobStatus.Paused) {
      await this.deps.quotaService.assertCanActivateMonitor(existing.userId);
      if (!existing.extractionPlan) {
        await this.deps.quotaService.assertCanCompile(existing.userId);
      }
    }

    if (!existing.extractionPlan) {
      const updated = await this.updateOrThrow(id, {
        status: JobStatus.PendingCompilation,
      });
      await this.deps.jobScheduler.enqueueCompilation(existing.id, CompilationReason.Manual);
      return this.presentAndNotify(updated);
    }

    const repeatableKey = await this.deps.jobScheduler.scheduleRepeatableJob(
      existing.id,
      existing.cronExpression
    );
    const updated = await this.updateOrThrow(id, {
      status: JobStatus.Active,
      bullmqRepeatableKey: repeatableKey,
    });
    return this.presentAndNotify(updated);
  }

  async triggerManualScrape(id: string, userId?: string): Promise<TriggerJobDto> {
    const existing = await this.getOwnedJob(id, userId);

    if (!existing.extractionPlan || existing.status === JobStatus.PendingCompilation) {
      await this.deps.jobScheduler.enqueueCompilation(existing.id, CompilationReason.Manual);
      await this.deps.realtimeService.notifyJobUpdated(existing.userId, existing.id, existing.status);
      return { queued: true, mode: 'compile' };
    }

    await this.deps.jobScheduler.enqueueImmediateScrape(existing.id);
    await this.deps.realtimeService.notifyJobUpdated(existing.userId, existing.id, existing.status);
    return { queued: true, mode: 'scrape' };
  }

  async triggerManualRecompile(id: string, userId?: string): Promise<ScrapingJobDto> {
    const existing = await this.getOwnedJob(id, userId);
    await this.assertNoActiveWork(existing, 'recompile');

    const updated = await this.updateOrThrow(id, {
      status: JobStatus.Recovering,
      lastError: null,
    });

    await this.deps.jobScheduler.enqueueCompilation(existing.id, CompilationReason.Manual);
    return this.presentAndNotify(updated);
  }

  async listPlanVersions(
    jobId: string,
    page = 1,
    pageSize = 10,
    userId?: string
  ): Promise<JobPlanVersionsDto> {
    const existing = await this.getOwnedJob(jobId, userId);
    const [initialResult, activeEntity] = await Promise.all([
      this.deps.jobRepository.findPaginatedPlanVersions(jobId, page, pageSize),
      existing.planRevision
        ? this.deps.jobRepository.findPlanVersionByRevision(jobId, existing.planRevision)
        : Promise.resolve(null),
    ]);

    const versionPage = await resolvePageResult(page, pageSize, initialResult, (safePage) =>
      this.deps.jobRepository.findPaginatedPlanVersions(jobId, safePage, pageSize)
    );

    return {
      jobId: existing.id,
      activeVersionNumber: activeEntity?.versionNumber ?? null,
      versions: versionPage.items.map((item) =>
        JobMapper.planVersionEntityToDto(item, existing.planRevision)
      ),
      pagination: versionPage.pagination,
    };
  }

  async rollbackPlanVersion(
    jobId: string,
    versionNumber: number,
    userId?: string
  ): Promise<ScrapingJobDto> {
    const existing = await this.getOwnedJob(jobId, userId);
    await this.assertNoActiveWork(existing, 'rollback');

    const targetVersion = await this.deps.jobRepository.findPlanVersionByNumber(
      jobId,
      versionNumber
    );
    if (!targetVersion) {
      throw new PlanVersionNotFoundError(versionNumber);
    }

    if (existing.planRevision && existing.planRevision === targetVersion.planRevision) {
      return this.deps.presenter.present(existing);
    }

    const isPaused = existing.status === JobStatus.Paused;
    let bullmqRepeatableKey: string | null = null;

    if (!isPaused) {
      await this.deps.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      bullmqRepeatableKey = await this.deps.jobScheduler.scheduleRepeatableJob(
        existing.id,
        existing.cronExpression
      );
    }

    const updated = await this.updateOrThrow(jobId, {
      extractionPlan: targetVersion.extractionPlan,
      planRevision: targetVersion.planRevision,
      contractRevision: targetVersion.contractRevision,
      userPrompt: targetVersion.userPrompt,
      url: targetVersion.url,
      status: isPaused ? JobStatus.Paused : JobStatus.Active,
      lastError: null,
      bullmqRepeatableKey,
    });

    return this.presentAndNotify(updated);
  }

  async cancelCompilation(id: string, userId?: string): Promise<ScrapingJobDto> {
    const existing = await this.getOwnedJob(id, userId);

    if (
      existing.status !== JobStatus.PendingCompilation &&
      existing.status !== JobStatus.Recovering
    ) {
      throw new NoCompilationInProgressError();
    }

    this.deps.compilationControl.cancelCompilation(existing.id, 'Compilation cancelled by user');
    await this.deps.jobScheduler.removePendingCompilations(existing.id);

    const targetStatus = existing.extractionPlan ? JobStatus.Active : JobStatus.Paused;
    const updated = await this.updateOrThrow(id, {
      status: targetStatus,
      lastError: null,
    });

    return this.presentAndNotify(updated);
  }

  async deleteJob(id: string, userId?: string): Promise<void> {
    const existing = await this.getOwnedJob(id, userId);

    this.deps.compilationControl.cancelCompilation(existing.id, 'Monitor deleted by user');
    await this.deps.jobScheduler.removePendingCompilations(existing.id);
    await this.deps.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
    await this.deps.jobRepository.deleteJob(id);
    await this.deps.realtimeService.notifyJobDeleted(existing.userId, existing.id);
  }

  async getJobRuns(
    jobId: string,
    page = 1,
    pageSize: number = PAGINATION_RUNS_PAGE_SIZE,
    userId?: string
  ): Promise<JobRunsDto> {
    const existing = await this.getOwnedJob(jobId, userId);

    const [paginatedResult, summaryStats, recentRuns, latestSuccessfulRun] = await Promise.all([
      this.deps.jobRepository.findPaginatedRunsByJobId(jobId, page, pageSize),
      this.deps.jobRepository.getJobRunsSummary(jobId),
      this.deps.jobRepository.findRunsByJobId(jobId, 5),
      this.deps.jobRepository.findLatestSuccessfulRun(jobId),
    ]);

    const runPage = await resolvePageResult(page, pageSize, paginatedResult, (safePage) =>
      this.deps.jobRepository.findPaginatedRunsByJobId(jobId, safePage, pageSize)
    );
    const runEntities = runPage.items;
    const identityFields = existing.extractionPlan?.intent.identityFields ?? [];

    const successfulRuns = recentRuns.filter(
      (run) =>
        run.status === RunStatus.Success &&
        run.extractedData &&
        run.extractionReport &&
        run.contractRevision === existing.contractRevision
    );
    let latestDiff: DiffSummary | null = null;
    if (successfulRuns.length >= 2) {
      const [current, previous] = successfulRuns;
      latestDiff = buildDiffSummary(
        comparisonPayload(previous!.extractedData!, identityFields),
        comparisonPayload(current!.extractedData!, identityFields)
      );
    }

    const oldestOnPage = runEntities.at(-1);
    const previousCollectionRun =
      existing.extractionPlan?.intent.scope === ExtractionScope.Collection && oldestOnPage
        ? await this.deps.jobRepository.findPreviousCompleteCollectionRun(
            jobId,
            { executedAt: oldestOnPage.executedAt, id: oldestOnPage.id },
            existing.contractRevision
          )
        : null;

    return {
      runs: runEntities.map(JobMapper.runEntityToDto),
      previousCollectionRun: previousCollectionRun
        ? JobMapper.runEntityToDto(previousCollectionRun)
        : null,
      latestSuccessfulRun: latestSuccessfulRun
        ? JobMapper.runEntityToDto(latestSuccessfulRun)
        : null,
      latestDiff,
      pagination: runPage.pagination,
      summary: summaryStats,
    };
  }

  async getDashboardStats(userId?: string): Promise<DashboardStatsDto> {
    return this.deps.jobRepository.getStats(userId);
  }

  async getJobTimeseries(
    jobId: string,
    range: TimeseriesRange = 'all',
    page = 1,
    pageSize: number = PAGINATION_TIMESERIES_PAGE_SIZE,
    userId?: string
  ): Promise<JobTimeseriesDto> {
    await this.getOwnedJob(jobId, userId);

    const result = await resolvePageResult(
      page,
      pageSize,
      await this.deps.jobRepository.findPaginatedTimeseriesByJobId(jobId, range, page, pageSize),
      (safePage) =>
        this.deps.jobRepository.findPaginatedTimeseriesByJobId(jobId, range, safePage, pageSize)
    );

    return {
      jobId,
      range,
      points: result.items.map(JobMapper.timeseriesPointToDto),
      previousPoint: result.previousItem
        ? JobMapper.timeseriesPointToDto(result.previousItem)
        : null,
      pagination: result.pagination,
    };
  }

  private async getOwnedJob(id: string, userId?: string): Promise<ScrapingJobEntity> {
    const entity = await this.deps.jobRepository.findById(id);
    if (!entity || (userId && entity.userId !== userId)) {
      throw new JobNotFoundError(id);
    }
    return entity;
  }

  private async updateOrThrow(id: string, patch: UpdateJobPatch): Promise<ScrapingJobEntity> {
    const updated = await this.deps.jobRepository.updateJob(id, patch);
    if (!updated) {
      throw new JobNotFoundError(id);
    }
    return updated;
  }

  private async presentAndNotify(job: ScrapingJobEntity): Promise<ScrapingJobDto> {
    const dto = await this.deps.presenter.present(job);
    await this.deps.realtimeService.notifyJobUpdated(job.userId, dto.id, dto.status);
    return dto;
  }

  private async assertNoActiveWork(
    job: ScrapingJobEntity,
    action: 'recompile' | 'rollback'
  ): Promise<void> {
    if (job.status === JobStatus.Recovering || job.status === JobStatus.PendingCompilation) {
      throw new CompilationAlreadyInProgressError(action);
    }
    const runningRun = await this.deps.jobRepository.findRunningRun(job.id);
    if (runningRun) {
      throw new ExtractionRunInProgressError(action);
    }
  }

  private hasOriginChanged(previousUrl: string, nextUrl: string): boolean {
    try {
      return new URL(nextUrl).origin !== new URL(previousUrl).origin;
    } catch {
      return true;
    }
  }

  private assertValidCron(cronExpression: string): string {
    const trimmed = cronExpression.trim();
    const cronCheck = validateCronFrequency(trimmed, env.MIN_CRON_INTERVAL_MINUTES);
    if (!cronCheck.valid) {
      throw new InvalidCronExpressionError(
        cronCheck.error ??
          `Invalid cron expression or frequency lower than minimum allowed floor of ${env.MIN_CRON_INTERVAL_MINUTES} minutes.`
      );
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
      throw new MonitorNameAlreadyExistsError();
    }
  }
}
