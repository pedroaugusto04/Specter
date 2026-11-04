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
import type {
  CreateJobInput,
  CreateJobRunInput,
  DashboardStats,
  IJobRepository,
  UpdateJobPatch,
} from '../../src/repositories/jobRepository.js';
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
} from '../../src/types/domain.js';
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
  public pendingDeliveries: AlertDelivery[] = [];
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
    const run = await this.createRun(input);
    this.pendingDeliveries.push(...deliveries);
    if (patch) await this.updateJob(input.jobId, patch);
    return run;
  }
  async purgeEvidence(_cutoff: Date) {}
  async createJob(input: CreateJobInput): Promise<ScrapingJobEntity> {
    const now = new Date();
    const entity: ScrapingJobEntity = {
      id: crypto.randomUUID(),
      userId: input.userId ?? '00000000-0000-0000-0000-000000000000',
      url: input.url,
      userPrompt: input.userPrompt,
      notificationEmail: input.notificationEmail,
      webhookUrl: input.webhookUrl ?? null,
      cronExpression: input.cronExpression,
      bullmqRepeatableKey: null,
      extractionPlan: null,
      status: 'PENDING_COMPILATION',
      lastError: null,
      failureCount: 0,
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
  async findActiveJobs(): Promise<ScrapingJobEntity[]> {
    return Array.from(this.jobs.values()).filter((j) => j.status === 'ACTIVE');
  }
  async updateJob(id: string, patch: UpdateJobPatch): Promise<ScrapingJobEntity | null> {
    const existing = this.jobs.get(id);
    if (!existing) return null;
    const updated: ScrapingJobEntity = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
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
      healingOrCompilingJobs: allJobs.filter(
        (j) => j.status === 'HEALING' || j.status === 'PENDING_COMPILATION'
      ).length,
      failedOrPausedJobs: allJobs.filter((j) => j.status === 'FAILED' || j.status === 'PAUSED')
        .length,
      totalRuns: userRuns.length,
      DetectedChangesCount: userRuns.filter((r) => r.hasChanges === 'YES').length,
    };
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
    reason: 'initial' | 'healing' | 'manual';
  }> = [];
  public immediateScrapeQueue: string[] = [];
  public scheduledRepeatables = new Map<string, string>();
  async enqueueCompilation(jobId: string, reason: 'initial' | 'healing' | 'manual'): Promise<void> {
    this.compilationQueue.push({ jobId, reason });
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
export class InMemoryIntegrationRepository {
  public integrations = new Map<string, any>();
  async findByUserId(userId: string): Promise<any | null> {
    const item = this.integrations.get(userId);
    return item ? { ...item } : null;
  }
  async upsert(userId: string, input: any): Promise<any> {
    const existing = this.integrations.get(userId);
    const now = new Date();
    const entity = {
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
