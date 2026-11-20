import type { AlertDelivery } from '../../src/notifications/contracts.js';
import { fixturePlan } from './extractionFixtures.js';
import crypto from 'crypto';
import type {
  FixtureCompilerInput as CompilerInput,
  FixtureCompiler as ICompilerProvider,
} from './extractionFixtures.js';
import type { ExtractionPlan } from '../../src/extraction/contracts.js';
import type {
  AlertPayload,
  INotificationProvider,
} from '../../src/providers/notifications/notification.interface.js';
import type {
  IScraperEngine,
  ScrapeOptions,
  ScrapeResult,
} from '../../src/providers/scraping/scraper.interface.js';
import type { IJobScheduler } from '../../src/queues/scheduler.interface.js';
import type { ICompilationControl } from '../../src/services/compilationControl.interface.js';
import type {
  CreateJobInput,
  CreateJobRunInput,
  DashboardStats,
  IJobRepository,
  JobRunsSummary,
  PaginatedTimeseriesResult,
  PaginatedRunsResult,
  UpdateJobPatch,
} from '../../src/repositories/jobRepository.js';
import type {
  JobPlanVersionEntity,
  NewJobPlanVersion,
  TimeseriesRowEntity,
} from '../../src/types/domain.js';
import type { TimeseriesRange } from '@specter/contracts';
import { PAGINATION_RUNS_PAGE_SIZE } from '@specter/contracts';
import { RealtimeService } from '../../src/services/realtimeService.js';
import { InMemoryRealtimeEventBus } from '../../src/providers/realtime/inMemoryRealtime.provider.js';
import { QuotaService } from '../../src/services/quotaService.js';
import { EnvPlanLimitResolver } from '../../src/services/quotas/envPlanLimitResolver.js';
import { JobService, type JobServiceDeps } from '../../src/services/jobService.js';
import {
  ScrapeExecutionService,
  type ScrapeExecutionServiceDeps,
} from '../../src/services/scrapeExecutionService.js';
import {
  CompilationService,
  type CompilationServiceDeps,
} from '../../src/services/compilationService.js';
import {
  NotificationDispatcher,
  type NotificationDispatcherDeps,
} from '../../src/providers/notifications/notificationDispatcher.js';
import {
  AccessCooldownService,
  type IAccessCooldownStore,
} from '../../src/acquisition/cooldown.js';
import type {
  CreateUserInput,
  IUserRepository,
  UpdateUserPatch,
} from '../../src/repositories/userRepository.js';
import type {
  JobRunEntity,
  JobStatus,
  ScrapingJobEntity,
  UserEntity,
  UserIntegrationEntity,
} from '../../src/types/domain.js';
import type {
  IIntegrationRepository,
  UpsertIntegrationInput,
} from '../../src/repositories/integrationRepository.js';
import type {
  ISessionRepository,
  UpsertSessionInput,
} from '../../src/repositories/sessionRepository.js';
import type { IUsageRepository, MonthlyUsage } from '../../src/repositories/usageRepository.js';
import type { UserWebSessionEntity } from '../../src/types/domain.js';

export const noopCompilationControl: ICompilationControl = {
  cancelCompilation: () => false,
};

export class InMemoryUserRepository implements IUserRepository {
  public users = new Map<string, UserEntity>();
  async findById(id: string): Promise<UserEntity | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }
  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email === normalized) {
        return { ...user };
      }
    }
    return null;
  }
  async findByGoogleId(googleId: string): Promise<UserEntity | null> {
    for (const user of this.users.values()) {
      if (user.googleId === googleId) {
        return { ...user };
      }
    }
    return null;
  }
  async createUser(input: CreateUserInput): Promise<UserEntity> {
    const now = new Date();
    const entity: UserEntity = {
      id: crypto.randomUUID(),
      email: input.email.trim().toLowerCase(),
      name: input.name ?? null,
      passwordHash: input.passwordHash ?? null,
      googleId: input.googleId ?? null,
      pageLanguage: null,
      browserPageLanguage: null,
      timezone: input.timezone ?? 'America/Sao_Paulo',
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(entity.id, entity);
    return { ...entity };
  }
  async updateUser(id: string, patch: UpdateUserPatch): Promise<UserEntity | null> {
    const existing = this.users.get(id);
    if (!existing) return null;
    const updated: UserEntity = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return { ...updated };
  }
}
export class InMemoryJobRepository implements IJobRepository {
  public jobs = new Map<string, ScrapingJobEntity>();
  public runs: JobRunEntity[] = [];
  public planVersions: JobPlanVersionEntity[] = [];
  public pendingDeliveries: AlertDelivery[] = [];
  public usageRepository?: InMemoryUsageRepository;
  async commitRun(
    input: CreateJobRunInput,
    deliveries: AlertDelivery[],
    patch?: UpdateJobPatch,
    expectedUpdatedAt?: Date
  ) {
    const current = this.jobs.get(input.jobId);
    if (
      !current ||
      current.status === 'PAUSED' ||
      (expectedUpdatedAt && current.updatedAt.getTime() !== expectedUpdatedAt.getTime())
    )
      throw new Error('Stale snapshot');
    const existing = input.id ? this.runs.find((run) => run.id === input.id) : undefined;
    if (existing && existing.status !== 'RUNNING') return { ...existing };
    const { chargeUsage: _charge, ...values } = input;
    const run = existing ? Object.assign(existing, values) : await this.createRun(values);
    if (run.status !== 'RUNNING') {
      run.completedAt = new Date();
      run.phase = null;
      run.nextAttemptAt = null;
    }
    this.pendingDeliveries.push(...deliveries);
    if (input.chargeUsage === 'execution')
      await this.usageRepository?.incrementExecutions(current.userId);
    if (input.chargeUsage === 'compilation')
      await this.usageRepository?.incrementCompilations(current.userId);
    if (patch) {
      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      this.jobs.set(input.jobId, { ...current, ...patch, updatedAt });
      run.monitorUpdatedAt = updatedAt;
    }
    if (patch?.extractionPlan) {
      const versions = this.planVersions.filter((v) => v.jobId === input.jobId);
      const nextVersion = versions.length
        ? Math.max(...versions.map((v) => v.versionNumber)) + 1
        : 1;
      this.planVersions.push({
        id: crypto.randomUUID(),
        jobId: input.jobId,
        versionNumber: nextVersion,
        planRevision: patch.planRevision ?? `v${nextVersion}`,
        contractRevision: patch.contractRevision ?? null,
        url: current.url,
        userPrompt: current.userPrompt,
        extractionPlan: patch.extractionPlan,
        triggerReason: input.recoveredAutomatically
          ? 'recovery'
          : nextVersion === 1
          ? 'initial'
          : 'manual_recompile',
        createdByRunId: run.id,
        createdAt: new Date(),
      });
    }
    return run;
  }
  async findRun(id: string) {
    return this.runs.find((run) => run.id === id) ?? null;
  }
  async findRunningRuns() {
    return this.runs.filter((run) => run.status === 'RUNNING');
  }
  async findRunningRun(jobId: string) {
    return this.runs.find((run) => run.jobId === jobId && run.status === 'RUNNING') ?? null;
  }
  async savePlanVersion(version: NewJobPlanVersion): Promise<JobPlanVersionEntity> {
    const entity: JobPlanVersionEntity = {
      ...version,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    this.planVersions.push(entity);
    return { ...entity };
  }
  async getLatestPlanVersionNumber(jobId: string): Promise<number> {
    const versions = this.planVersions.filter((v) => v.jobId === jobId);
    if (!versions.length) return 0;
    return Math.max(...versions.map((v) => v.versionNumber));
  }
  async findPaginatedPlanVersions(jobId: string, page = 1, pageSize = 10) {
    const versions = this.planVersions
      .filter((v) => v.jobId === jobId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
    const totalItems = versions.length;
    const offset = Math.max(0, (page - 1) * pageSize);
    const items = versions.slice(offset, offset + pageSize).map((v) => ({ ...v }));
    return { items, totalItems };
  }
  async findPlanVersionByNumber(jobId: string, versionNumber: number) {
    const found = this.planVersions.find(
      (v) => v.jobId === jobId && v.versionNumber === versionNumber
    );
    return found ? { ...found } : null;
  }
  async cancelRuns(jobId: string) {
    for (const run of this.runs)
      if (run.jobId === jobId && run.status === 'RUNNING') {
        run.status = 'CANCELLED';
        run.completedAt = new Date();
        run.phase = null;
        run.nextAttemptAt = null;
      }
  }
  async beginRun(job: ScrapingJobEntity, originQueueId: string) {
    const existing = this.runs.find((run) => run.originQueueId === originQueueId);
    if (existing) return existing;
    if (this.runs.some((run) => run.jobId === job.id && run.status === 'RUNNING')) return null;
    return this.createRun({
      jobId: job.id,
      originQueueId,
      status: 'RUNNING',
      hasChanges: 'NO',
      phase: 'CHECKING',
      startedAt: new Date(),
      monitorUpdatedAt: job.updatedAt,
      metadata: {
        accessAttempts: 0,
        confirmations: 0,
        recoveryAttempts: 0,
        compilationAttempts: 0,
        reasons: [],
      },
    });
  }
  async purgeEvidence(_cutoff: Date) {}
  async createJob(input: CreateJobInput): Promise<ScrapingJobEntity> {
    const now = new Date();
    const entity: ScrapingJobEntity = {
      id: crypto.randomUUID(),
      userId: input.userId ?? '00000000-0000-0000-0000-000000000000',
      name: input.name ?? 'Monitor 1',
      url: input.url,
      userPrompt: input.userPrompt,
      notificationEmail: input.notificationEmail ?? null,
      webhookUrl: input.webhookUrl ?? null,
      webhookSecret: input.webhookSecret ?? null,
      cronExpression: input.cronExpression,
      bullmqRepeatableKey: null,
      extractionPlan: null,
      status: 'PENDING_COMPILATION',
      lastError: null,
      captureScreenshotOnChange: input.captureScreenshotOnChange ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(entity.id, entity);
    return { ...entity };
  }
  async findById(id: string): Promise<ScrapingJobEntity | null> {
    const job = this.jobs.get(id);
    return job ? { ...job } : null;
  }
  async findAll(statusFilter?: JobStatus, userId?: string): Promise<ScrapingJobEntity[]> {
    const all = Array.from(this.jobs.values());
    const filtered = all.filter((j) => {
      if (statusFilter && j.status !== statusFilter) return false;
      if (userId && j.userId !== userId) return false;
      return true;
    });
    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async findPage(input: {
    status?: JobStatus | 'recovering' | 'paused';
    userId: string;
    page: number;
    pageSize: number;
    search?: string;
  }) {
    const search = input.search?.trim().toLowerCase();
    const matching = (await this.findAll(undefined, input.userId)).filter((job) => {
      if (
        input.status === 'recovering' &&
        !['RECOVERING', 'PENDING_COMPILATION'].includes(job.status)
      )
        return false;
      if (input.status === 'paused' && !['PAUSED', 'FAILED'].includes(job.status)) return false;
      if (
        input.status &&
        !['recovering', 'paused'].includes(input.status) &&
        job.status !== input.status
      )
        return false;
      return (
        !search ||
        [job.name, job.url, job.userPrompt].some((value) => value.toLowerCase().includes(search))
      );
    });
    const offset = (input.page - 1) * input.pageSize;
    return { items: matching.slice(offset, offset + input.pageSize), totalItems: matching.length };
  }
  async findActiveJobs(): Promise<ScrapingJobEntity[]> {
    return Array.from(this.jobs.values()).filter((j) => j.status === 'ACTIVE');
  }
  async updateJob(id: string, patch: UpdateJobPatch): Promise<ScrapingJobEntity | null> {
    const existing = this.jobs.get(id);
    if (!existing) return null;
    await this.cancelRuns(id);
    const updated: ScrapingJobEntity = {
      ...existing,
      ...patch,
      notificationEmail:
        patch.notificationEmail !== undefined
          ? (patch.notificationEmail ?? null)
          : existing.notificationEmail,
      webhookSecret:
        patch.webhookSecret !== undefined
          ? (patch.webhookSecret ?? null)
          : (existing.webhookSecret ?? null),
      updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)),
    };
    this.jobs.set(id, updated);
    return { ...updated };
  }
  async deleteJob(id: string): Promise<boolean> {
    const existed = this.jobs.delete(id);
    if (existed) {
      this.runs = this.runs.filter((r) => r.jobId !== id);
    }
    return existed;
  }
  async createRun(input: CreateJobRunInput): Promise<JobRunEntity> {
    const entity: JobRunEntity = {
      ...input,
      id: crypto.randomUUID(),
      jobId: input.jobId,
      extractionReport: input.extractionReport,
      contractRevision: input.contractRevision,
      extractedData: input.extractedData ?? null,
      normalizedHash: input.normalizedHash ?? null,
      hasChanges: input.hasChanges,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      httpStatus: input.httpStatus ?? null,
      durationMs: input.durationMs ?? null,
      screenshotUrl: input.screenshotUrl ?? null,
      executedAt: input.executedAt ?? new Date(),
    };
    this.runs.push(entity);
    return { ...entity };
  }
  async findRunsByJobId(jobId: string, limit = 50): Promise<JobRunEntity[]> {
    return this.runs
      .filter((r) => r.jobId === jobId)
      .sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime())
      .slice(0, limit);
  }
  async findPaginatedRunsByJobId(
    jobId: string,
    page = 1,
    pageSize = PAGINATION_RUNS_PAGE_SIZE
  ): Promise<PaginatedRunsResult> {
    const filtered = this.runs
      .filter((r) => r.jobId === jobId)
      .sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());
    const offset = Math.max(0, (page - 1) * pageSize);
    return {
      items: filtered.slice(offset, offset + pageSize),
      totalItems: filtered.length,
    };
  }
  async findPaginatedTimeseriesByJobId(
    jobId: string,
    range: TimeseriesRange,
    page: number,
    pageSize: number
  ): Promise<PaginatedTimeseriesResult> {
    const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : range === '30d' ? 24 * 30 : null;
    const cutoff = hours ? Date.now() - hours * 3600 * 1000 : null;
    const matching = this.runs
      .filter(
        (r) =>
          r.jobId === jobId &&
          r.status === 'SUCCESS' &&
          (!cutoff || r.executedAt.getTime() >= cutoff)
      )
      .sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime() || b.id.localeCompare(a.id));
    const offset = (page - 1) * pageSize;
    const toRow = (r: JobRunEntity): TimeseriesRowEntity => ({
      id: r.id,
      executedAt: r.executedAt,
      status: r.status,
      hasChanges: r.hasChanges,
      durationMs: r.durationMs,
      contractRevision: r.contractRevision ?? null,
      errorMessage: r.errorMessage,
      extractedData: r.extractedData,
    });
    const rows = matching.slice(offset, offset + pageSize);
    const oldest = rows.at(-1);
    const previous = oldest
      ? (matching.find(
          (run) =>
            run.executedAt < oldest.executedAt ||
            (run.executedAt.getTime() === oldest.executedAt.getTime() && run.id < oldest.id)
        ) ?? null)
      : null;
    return {
      items: rows.map(toRow),
      previousItem: previous ? toRow(previous) : null,
      totalItems: matching.length,
    };
  }
  async findPreviousCompleteCollectionRun(
    jobId: string,
    before: { executedAt: Date; id: string },
    contractRevision: string | null
  ): Promise<JobRunEntity | null> {
    return (
      this.runs
        .filter(
          (run) =>
            run.jobId === jobId &&
            run.status === 'SUCCESS' &&
            run.contractRevision === contractRevision &&
            ['COMPLETE', 'EMPTY'].includes(run.extractionReport?.coverage ?? '') &&
            (run.executedAt < before.executedAt ||
              (run.executedAt.getTime() === before.executedAt.getTime() && run.id < before.id))
        )
        .sort(
          (a, b) => b.executedAt.getTime() - a.executedAt.getTime() || b.id.localeCompare(a.id)
        )[0] ?? null
    );
  }
  async getJobRunsSummary(jobId: string): Promise<JobRunsSummary> {
    const jobRunsList = this.runs.filter((r) => r.jobId === jobId);
    const changed = jobRunsList.filter((r) => r.hasChanges === 'YES');
    const sortedChanged = [...changed].sort(
      (a, b) => b.executedAt.getTime() - a.executedAt.getTime()
    );
    const successfulWithDuration = jobRunsList.filter(
      (r) => r.status === 'SUCCESS' && typeof r.durationMs === 'number'
    );
    const averageDurationMs =
      successfulWithDuration.length > 0
        ? Math.round(
            successfulWithDuration.reduce((acc, r) => acc + (r.durationMs ?? 0), 0) /
              successfulWithDuration.length
          )
        : null;

    return {
      totalRuns: jobRunsList.length,
      changedRuns: changed.length,
      lastChange: sortedChanged[0]?.executedAt ? sortedChanged[0].executedAt.toISOString() : null,
      averageDurationMs,
    };
  }
  async findLatestSuccessfulRun(jobId: string): Promise<JobRunEntity | null> {
    const matches = this.runs
      .filter((r) => r.jobId === jobId && r.status === 'SUCCESS')
      .sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());
    return matches[0] ? { ...matches[0] } : null;
  }
  async deleteUnchangedRunsOlderThan(cutoffDate: Date): Promise<number> {
    const beforeCount = this.runs.length;
    this.runs = this.runs.filter(
      (r) => !(r.hasChanges === 'NO' && r.executedAt.getTime() < cutoffDate.getTime())
    );
    return beforeCount - this.runs.length;
  }
  async getStats(userId?: string): Promise<DashboardStats> {
    const allJobs = Array.from(this.jobs.values()).filter((j) =>
      userId ? j.userId === userId : true
    );
    const jobIds = new Set(allJobs.map((j) => j.id));
    const userRuns = userId ? this.runs.filter((r) => jobIds.has(r.jobId)) : this.runs;
    return {
      totalJobs: allJobs.length,
      activeJobs: allJobs.filter((j) => j.status === 'ACTIVE').length,
      recoveringOrCompilingJobs: allJobs.filter(
        (j) => j.status === 'RECOVERING' || j.status === 'PENDING_COMPILATION'
      ).length,
      failedOrPausedJobs: allJobs.filter((j) => j.status === 'FAILED' || j.status === 'PAUSED')
        .length,
      totalRuns: userRuns.length,
      DetectedChangesCount: userRuns.filter((r) => r.hasChanges === 'YES').length,
    };
  }
  async countActiveJobsByUserId(userId: string): Promise<number> {
    return Array.from(this.jobs.values()).filter(
      (j) => j.userId === userId && j.status !== 'PAUSED'
    ).length;
  }
}
export class MockCompilerProvider implements ICompilerProvider {
  public readonly name = 'mock-compiler';
  public calls: CompilerInput[] = [];
  private handler: (input: CompilerInput) => Promise<ExtractionPlan>;
  constructor(handler?: (input: CompilerInput) => Promise<ExtractionPlan>) {
    this.handler =
      handler ??
      (async () =>
        fixturePlan({
          mode: 'single',
          readySelector: 'body',
          scope: 'page',
          identityFields: [],
          triggerRules: [],
          triggerMatchMode: 'all',
          fields: {
            title: {
              sources: [
                { kind: 'dom', selector: '[data-testid="product-title"]', attribute: 'text' },
              ],
              type: 'string',
              required: true,
              locale: 'en-US',
            },
            price: {
              sources: [
                { kind: 'dom', selector: '[data-testid="product-price"]', attribute: 'text' },
              ],
              type: 'string',
              required: true,
              locale: 'en-US',
            },
          },
        }));
  }
  setHandler(handler: (input: CompilerInput) => Promise<ExtractionPlan>): void {
    this.handler = handler;
  }
  async compile(input: CompilerInput): Promise<ExtractionPlan> {
    this.calls.push(input);
    return this.handler(input);
  }
}
export class MockScraperEngine implements IScraperEngine {
  public readonly name = 'mock-scraper';
  public calls: Array<{
    url: string;
    options?: ScrapeOptions;
  }> = [];
  private handler: (url: string, options?: ScrapeOptions) => Promise<ScrapeResult>;
  constructor(handler?: (url: string, options?: ScrapeOptions) => Promise<ScrapeResult>) {
    this.handler =
      handler ??
      (async (url) => ({
        rawHtml: `<html><body><h1 data-testid="product-title">Notebook Pro</h1><span data-testid="product-price">$ 1,200.00</span></body></html>`,
        httpStatus: 200,
        url,
        durationMs: 42,
      }));
  }
  setHandler(handler: (url: string, options?: ScrapeOptions) => Promise<ScrapeResult>): void {
    this.handler = handler;
  }
  async fetchHtml(url: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    this.calls.push({ url, options });
    return this.handler(url, options);
  }
}
export class MockNotificationProvider implements INotificationProvider {
  public readonly name = 'mock-notification';
  public sentAlerts: AlertPayload[] = [];
  async prepare(payload: AlertPayload): Promise<AlertDelivery[]> {
    return [{ channel: 'email', destination: payload.to ?? 'test@example.com', payload }];
  }
  async sendAlert(payload: AlertPayload): Promise<void> {
    this.sentAlerts.push(payload);
  }
}
export class MockJobScheduler implements IJobScheduler {
  public compilationQueue: Array<{
    jobId: string;
    reason: 'initial' | 'recovery' | 'manual';
  }> = [];
  public immediateScrapeQueue: string[] = [];
  public scheduledRepeatables = new Map<string, string>();
  public runAttempts: { jobId: string; runId: string; attempt: number; at: Date }[] = [];
  async enqueueRunAttempt(jobId: string, runId: string, attempt: number, at: Date) {
    if (!this.runAttempts.some((item) => item.runId === runId && item.attempt === attempt))
      this.runAttempts.push({ jobId, runId, attempt, at });
  }
  async enqueueCompilation(
    jobId: string,
    reason: 'initial' | 'recovery' | 'manual'
  ): Promise<void> {
    this.compilationQueue.push({ jobId, reason });
  }
  async removePendingCompilations(jobId: string): Promise<void> {
    this.compilationQueue = this.compilationQueue.filter((item) => item.jobId !== jobId);
  }
  async enqueueImmediateScrape(jobId: string): Promise<void> {
    this.immediateScrapeQueue.push(jobId);
  }
  async scheduleRepeatableJob(jobId: string, cronExpression: string): Promise<string | null> {
    const key = `repeat:${jobId}:${cronExpression}`;
    this.scheduledRepeatables.set(jobId, key);
    return key;
  }
  async removeRepeatableJob(jobId: string): Promise<void> {
    this.scheduledRepeatables.delete(jobId);
  }
}
export class InMemoryIntegrationRepository implements IIntegrationRepository {
  public integrations = new Map<string, UserIntegrationEntity>();
  async findByUserId(userId: string): Promise<UserIntegrationEntity | null> {
    const item = this.integrations.get(userId);
    return item ? { ...item } : null;
  }
  async upsert(userId: string, input: UpsertIntegrationInput): Promise<UserIntegrationEntity> {
    const existing = this.integrations.get(userId);
    const now = new Date();
    const entity: UserIntegrationEntity = {
      id: existing?.id ?? crypto.randomUUID(),
      userId,
      telegramEnabled: input.telegramEnabled ?? existing?.telegramEnabled ?? false,
      telegramBotToken:
        input.telegramBotToken !== undefined
          ? input.telegramBotToken
          : (existing?.telegramBotToken ?? null),
      telegramChatId:
        input.telegramChatId !== undefined
          ? input.telegramChatId
          : (existing?.telegramChatId ?? null),
      webhookEnabled: input.webhookEnabled ?? existing?.webhookEnabled ?? false,
      webhookUrl:
        input.webhookUrl !== undefined ? input.webhookUrl : (existing?.webhookUrl ?? null),
      webhookSecret:
        input.webhookSecret !== undefined ? input.webhookSecret : (existing?.webhookSecret ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.integrations.set(userId, entity);
    return { ...entity };
  }
}

export class InMemorySessionRepository implements ISessionRepository {
  public sessions = new Map<string, UserWebSessionEntity>();

  async findByUserAndDomain(
    userId: string,
    hostOrDomain: string
  ): Promise<UserWebSessionEntity | null> {
    const clean = hostOrDomain.trim().toLowerCase();
    for (const s of this.sessions.values()) {
      if (s.userId === userId && (s.domain === clean || clean.endsWith(`.${s.domain}`))) {
        return { ...s };
      }
    }
    return null;
  }

  async listPageByUserId(userId: string, page: number, pageSize: number) {
    const matching = Array.from(this.sessions.values())
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id.localeCompare(a.id));
    const offset = (page - 1) * pageSize;
    return { items: matching.slice(offset, offset + pageSize), totalItems: matching.length };
  }

  async findById(id: string): Promise<UserWebSessionEntity | null> {
    const s = this.sessions.get(id);
    return s ? { ...s } : null;
  }

  async upsert(userId: string, input: UpsertSessionInput): Promise<UserWebSessionEntity> {
    const domain = input.domain.trim().toLowerCase();
    for (const [id, s] of this.sessions.entries()) {
      if (s.userId === userId && s.domain === domain) {
        const updated: UserWebSessionEntity = {
          ...s,
          name: input.name || s.name,
          storageState: input.storageState,
          cookieCount: input.storageState.cookies?.length ?? 0,
          updatedAt: new Date(),
        };
        this.sessions.set(id, updated);
        return { ...updated };
      }
    }

    const row: UserWebSessionEntity = {
      id: crypto.randomUUID(),
      userId,
      domain,
      name: input.name || domain,
      storageState: input.storageState,
      cookieCount: input.storageState.cookies?.length ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.set(row.id, row);
    return { ...row };
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const s = this.sessions.get(id);
    if (s && s.userId === userId) {
      this.sessions.delete(id);
      return true;
    }
    return false;
  }
}

export class InMemoryUsageRepository implements IUsageRepository {
  public usage = new Map<string, MonthlyUsage>();

  private key(userId: string, period?: string): string {
    return `${userId}:${period ?? new Date().toISOString().slice(0, 7)}`;
  }

  async getUsage(userId: string, period?: string): Promise<MonthlyUsage> {
    const current = this.usage.get(this.key(userId, period));
    return {
      compilationsCount: current?.compilationsCount ?? 0,
      executionsCount: current?.executionsCount ?? 0,
    };
  }

  async incrementCompilations(userId: string, period?: string): Promise<number> {
    const k = this.key(userId, period);
    const current = this.usage.get(k) ?? { compilationsCount: 0, executionsCount: 0 };
    current.compilationsCount += 1;
    this.usage.set(k, { ...current });
    return current.compilationsCount;
  }

  async incrementExecutions(userId: string, period?: string): Promise<number> {
    const k = this.key(userId, period);
    const current = this.usage.get(k) ?? { compilationsCount: 0, executionsCount: 0 };
    current.executionsCount += 1;
    this.usage.set(k, { ...current });
    return current.executionsCount;
  }
}

export class InMemoryAccessCooldownStore implements IAccessCooldownStore {
  private counts = new Map<string, number>();
  private until = new Map<string, number>();

  async get(key: string): Promise<number | null> {
    return this.until.get(key) ?? null;
  }
  async blocked(
    key: string,
    threshold: number,
    durationMs: number,
    now: number
  ): Promise<number | null> {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    if (count >= threshold) {
      const expires = now + durationMs;
      this.until.set(key, expires);
      return expires;
    }
    return null;
  }
  async clear(key: string): Promise<void> {
    this.counts.delete(key);
    this.until.delete(key);
  }
}

export class NoopAccessCooldownStore implements IAccessCooldownStore {
  async get(_key: string): Promise<number | null> {
    return null;
  }
  async blocked(
    _key: string,
    _threshold: number,
    _durationMs: number,
    _now: number
  ): Promise<number | null> {
    return null;
  }
  async clear(_key: string): Promise<void> {}
}

export function createDummyScraperEngine(name = 'dummy-scraper'): IScraperEngine {
  return {
    name,
    fetchHtml: async (url: string) => ({
      rawHtml: '<html><body>Mock</body></html>',
      httpStatus: 200,
      url,
      durationMs: 10,
    }),
  };
}

export function createTestRealtimeService(): RealtimeService {
  return new RealtimeService(new InMemoryRealtimeEventBus());
}

export function createTestQuotaService(
  jobRepository: IJobRepository = new InMemoryJobRepository(),
  usageRepository: IUsageRepository = new InMemoryUsageRepository()
): QuotaService {
  return new QuotaService({
    jobRepository,
    usageRepository,
    planLimitResolver: new EnvPlanLimitResolver(),
  });
}

export function createTestJobService(overrides: Partial<JobServiceDeps> = {}): JobService {
  const jobRepo = overrides.jobRepository ?? new InMemoryJobRepository();
  return new JobService({
    jobRepository: jobRepo,
    jobScheduler: overrides.jobScheduler ?? new MockJobScheduler(),
    compilationControl: overrides.compilationControl ?? noopCompilationControl,
    scraperEngine: overrides.scraperEngine ?? createDummyScraperEngine(),
    sessionRepository: overrides.sessionRepository ?? new InMemorySessionRepository(),
    realtimeService: overrides.realtimeService ?? createTestRealtimeService(),
    quotaService: overrides.quotaService ?? createTestQuotaService(jobRepo),
    ...overrides,
  });
}

export function createTestCompilationService(
  overrides: Partial<CompilationServiceDeps> & {
    jobRepository: IJobRepository;
    configurationPipeline: any;
    alertRouter: any;
    jobScheduler: any;
    storageProvider: any;
  }
): CompilationService {
  return new CompilationService({
    userRepository: new InMemoryUserRepository(),
    sessionRepository: new InMemorySessionRepository(),
    realtimeService: createTestRealtimeService(),
    quotaService: createTestQuotaService(overrides.jobRepository),
    ...overrides,
  });
}

export function createTestScrapeExecutionService(
  overrides: Partial<ScrapeExecutionServiceDeps> & {
    jobRepository: IJobRepository;
    planExecutor: any;
    alertRouter: any;
    jobScheduler: any;
    storageProvider: any;
  }
): ScrapeExecutionService {
  const sessionRepo = overrides.sessionRepository ?? new InMemorySessionRepository();
  return new ScrapeExecutionService({
    userRepository: new InMemoryUserRepository(),
    accessCooldown: new AccessCooldownService(new NoopAccessCooldownStore(), sessionRepo),
    sessionRepository: sessionRepo,
    realtimeService: createTestRealtimeService(),
    quotaService: createTestQuotaService(overrides.jobRepository),
    ...overrides,
  });
}

export function createTestNotificationDispatcher(
  overrides: Partial<NotificationDispatcherDeps> = {}
): NotificationDispatcher {
  return new NotificationDispatcher({
    emailProvider: { name: 'mock-email', sendAlert: async () => {} },
    telegramProvider: {
      name: 'mock-telegram',
      sendAlert: async () => {},
      sendTestMessage: async () => ({ ok: true }),
    },
    webhookProvider: {
      name: 'mock-webhook',
      sendAlert: async () => {},
      sendTestEvent: async () => ({ ok: true }),
    },
    integrationRepository: new InMemoryIntegrationRepository(),
    userRepository: new InMemoryUserRepository(),
    ...overrides,
  });
}
