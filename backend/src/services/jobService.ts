import { NotFoundError, ValidationError } from '../errors/domainErrors.js';
import { JobMapper, type JobRunDto, type ScrapingJobDto } from '../mappers/jobMapper.js';
import type { IJobScheduler } from '../queues/scheduler.interface.js';
import type { DashboardStats, IJobRepository } from '../repositories/jobRepository.js';
import type { DiffSummary, JobStatus } from '../types/domain.js';
import { validateCronFrequency } from '../utils/cronValidator.js';
import { buildDiffSummary } from '../utils/diffHasher.js';
import { normalizeUrl } from '../utils/urlNormalizer.js';

export interface CreateScrapingJobRequest {
  userId?: string;
  url: string;
  userPrompt: string;
  notificationEmail: string;
  cronExpression?: string;
}

export interface UpdateScrapingJobRequest {
  url?: string;
  userPrompt?: string;
  notificationEmail?: string;
  cronExpression?: string;
}

export class JobService {
  private readonly jobRepository: IJobRepository;
  private readonly jobScheduler: IJobScheduler;

  constructor(jobRepository: IJobRepository, jobScheduler: IJobScheduler) {
    this.jobRepository = jobRepository;
    this.jobScheduler = jobScheduler;
  }

  async createJob(request: CreateScrapingJobRequest): Promise<ScrapingJobDto> {
    const normalizedUrl = normalizeUrl(request.url);
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
      notificationEmail: request.notificationEmail.trim(),
      cronExpression,
    });

    await this.jobScheduler.enqueueCompilation(createdEntity.id, 'initial');

    return JobMapper.entityToDto(createdEntity);
  }

  async listJobs(statusFilter?: JobStatus): Promise<ScrapingJobDto[]> {
    const entities = await this.jobRepository.findAll(statusFilter);
    return entities.map(JobMapper.entityToDto);
  }

  async getJobById(id: string): Promise<ScrapingJobDto> {
    const entity = await this.jobRepository.findById(id);
    if (!entity) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }
    return JobMapper.entityToDto(entity);
  }

  async updateJob(id: string, request: UpdateScrapingJobRequest): Promise<ScrapingJobDto> {
    const existing = await this.jobRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    const patch: {
      url?: string;
      userPrompt?: string;
      notificationEmail?: string;
      cronExpression?: string;
      bullmqRepeatableKey?: string | null;
    } = {};

    if (request.url !== undefined) {
      patch.url = normalizeUrl(request.url);
    }
    if (request.userPrompt !== undefined) {
      patch.userPrompt = request.userPrompt.trim();
    }
    if (request.notificationEmail !== undefined) {
      patch.notificationEmail = request.notificationEmail.trim();
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

    const needsRecompile =
      (patch.url !== undefined && patch.url !== existing.url) ||
      (patch.userPrompt !== undefined && patch.userPrompt !== existing.userPrompt);

    if (needsRecompile) {
      if (existing.bullmqRepeatableKey) {
        await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      }
      patch.bullmqRepeatableKey = null;
    } else if (patch.cronExpression !== undefined && existing.status === 'ACTIVE') {
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

    // If URL or prompt changed, trigger recompilation
    if (needsRecompile) {
      await this.jobRepository.updateJob(id, {
        status: 'PENDING_COMPILATION',
        failureCount: 0,
      });
      await this.jobScheduler.enqueueCompilation(id, 'manual');
      const refreshed = await this.jobRepository.findById(id);
      return JobMapper.entityToDto(refreshed ?? updated);
    }

    return JobMapper.entityToDto(updated);
  }

  async setJobPauseState(id: string, paused: boolean): Promise<ScrapingJobDto> {
    const existing = await this.jobRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    if (paused) {
      await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
      const updated = await this.jobRepository.updateJob(id, {
        status: 'PAUSED',
        bullmqRepeatableKey: null,
      });
      return JobMapper.entityToDto(updated ?? existing);
    }

    // Resume job
    if (!existing.extractorConfig) {
      const updated = await this.jobRepository.updateJob(id, {
        status: 'PENDING_COMPILATION',
      });
      await this.jobScheduler.enqueueCompilation(existing.id, 'initial');
      return JobMapper.entityToDto(updated ?? existing);
    }

    const repeatableKey = await this.jobScheduler.scheduleRepeatableJob(
      existing.id,
      existing.cronExpression
    );
    const updated = await this.jobRepository.updateJob(id, {
      status: 'ACTIVE',
      bullmqRepeatableKey: repeatableKey,
    });
    return JobMapper.entityToDto(updated ?? existing);
  }

  async triggerManualScrape(id: string): Promise<{ queued: boolean; mode: 'scrape' | 'compile' }> {
    const existing = await this.jobRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    if (!existing.extractorConfig || existing.status === 'PENDING_COMPILATION') {
      await this.jobScheduler.enqueueCompilation(existing.id, 'manual');
      return { queued: true, mode: 'compile' };
    }

    await this.jobScheduler.enqueueImmediateScrape(existing.id);
    return { queued: true, mode: 'scrape' };
  }

  async triggerManualRecompile(id: string): Promise<ScrapingJobDto> {
    const existing = await this.jobRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    const updated = await this.jobRepository.updateJob(id, {
      status: 'HEALING',
      failureCount: 0,
      lastError: null,
    });

    await this.jobScheduler.enqueueCompilation(existing.id, 'manual');
    return JobMapper.entityToDto(updated ?? existing);
  }

  async deleteJob(id: string): Promise<void> {
    const existing = await this.jobRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Monitoring job not found: ${id}`);
    }

    await this.jobScheduler.removeRepeatableJob(existing.id, existing.bullmqRepeatableKey);
    await this.jobRepository.deleteJob(id);
  }

  async getJobRuns(
    jobId: string,
    limit = 50
  ): Promise<{ runs: JobRunDto[]; latestDiff: DiffSummary | null }> {
    const existing = await this.jobRepository.findById(jobId);
    if (!existing) {
      throw new NotFoundError(`Monitoring job not found: ${jobId}`);
    }

    const runEntities = await this.jobRepository.findRunsByJobId(jobId, limit);
    const runs = runEntities.map(JobMapper.runEntityToDto);

    const successfulRuns = runEntities.filter((r) => r.status === 'SUCCESS' && r.extractedData);
    let latestDiff: DiffSummary | null = null;

    if (successfulRuns.length >= 2) {
      const current = successfulRuns[0]!;
      const previous = successfulRuns[1]!;
      latestDiff = buildDiffSummary(previous.extractedData, current.extractedData);
    }

    return { runs, latestDiff };
  }

  async getDashboardStats(): Promise<DashboardStats> {
    return this.jobRepository.getStats();
  }
}
