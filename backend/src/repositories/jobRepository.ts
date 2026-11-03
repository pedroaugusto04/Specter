import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.js';
import { jobRuns, scrapingJobs } from '../db/schema.js';
import { JobMapper } from '../mappers/jobMapper.js';
import type {
  ChangeStatus,
  JobRunEntity,
  JobStatus,
  RunStatus,
  ScrapingJobEntity,
} from '../types/domain.js';
import type { ExtractedPayload, ExtractorConfig } from '../types/extractor.js';

export interface CreateJobInput {
  userId?: string;
  url: string;
  userPrompt: string;
  notificationEmail: string;
  webhookUrl?: string | null;
  cronExpression: string;
  captureScreenshotOnChange?: boolean;
}

export interface UpdateJobPatch {
  url?: string;
  userPrompt?: string;
  notificationEmail?: string;
  webhookUrl?: string | null;
  cronExpression?: string;
  bullmqRepeatableKey?: string | null;
  extractorConfig?: ExtractorConfig | null;
  status?: JobStatus;
  lastError?: string | null;
  failureCount?: number;
  captureScreenshotOnChange?: boolean;
}

export interface CreateJobRunInput {
  jobId: string;
  extractedData?: ExtractedPayload | null;
  normalizedHash?: string | null;
  hasChanges: ChangeStatus;
  status: RunStatus;
  errorMessage?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  screenshotUrl?: string | null;
  executedAt?: Date;
}

export interface DashboardStats {
  totalJobs: number;
  activeJobs: number;
  healingOrCompilingJobs: number;
  failedOrPausedJobs: number;
  totalRuns: number;
  DetectedChangesCount: number;
}

export interface IJobRepository {
  createJob(input: CreateJobInput): Promise<ScrapingJobEntity>;
  findById(id: string): Promise<ScrapingJobEntity | null>;
  findAll(statusFilter?: JobStatus, userId?: string): Promise<ScrapingJobEntity[]>;
  findActiveJobs(): Promise<ScrapingJobEntity[]>;
  updateJob(id: string, patch: UpdateJobPatch): Promise<ScrapingJobEntity | null>;
  deleteJob(id: string): Promise<boolean>;
  createRun(input: CreateJobRunInput): Promise<JobRunEntity>;
  findRunsByJobId(jobId: string, limit?: number): Promise<JobRunEntity[]>;
  findLatestSuccessfulRun(jobId: string): Promise<JobRunEntity | null>;
  deleteUnchangedRunsOlderThan(cutoffDate: Date): Promise<number>;
  getStats(userId?: string): Promise<DashboardStats>;
}

export class DrizzleJobRepository implements IJobRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDb();
  }

  async createJob(input: CreateJobInput): Promise<ScrapingJobEntity> {
    const [row] = await this.db
      .insert(scrapingJobs)
      .values({
        userId: input.userId ?? '00000000-0000-0000-0000-000000000000',
        url: input.url,
        userPrompt: input.userPrompt,
        notificationEmail: input.notificationEmail,
        webhookUrl: input.webhookUrl ?? null,
        cronExpression: input.cronExpression,
        captureScreenshotOnChange: input.captureScreenshotOnChange ?? false,
        status: 'PENDING_COMPILATION',
        failureCount: 0,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to insert scraping job record.');
    }

    return JobMapper.rowToEntity(row);
  }

  async findById(id: string): Promise<ScrapingJobEntity | null> {
    const [row] = await this.db.select().from(scrapingJobs).where(eq(scrapingJobs.id, id)).limit(1);

    return row ? JobMapper.rowToEntity(row) : null;
  }

  async findAll(statusFilter?: JobStatus, userId?: string): Promise<ScrapingJobEntity[]> {
    const conditions = [];
    if (statusFilter) {
      conditions.push(eq(scrapingJobs.status, statusFilter));
    }
    if (userId) {
      conditions.push(eq(scrapingJobs.userId, userId));
    }

    const rows =
      conditions.length > 0
        ? await this.db
            .select()
            .from(scrapingJobs)
            .where(conditions.length === 1 ? conditions[0] : and(...conditions))
            .orderBy(desc(scrapingJobs.createdAt))
        : await this.db.select().from(scrapingJobs).orderBy(desc(scrapingJobs.createdAt));

    return rows.map(JobMapper.rowToEntity);
  }

  async findActiveJobs(): Promise<ScrapingJobEntity[]> {
    const rows = await this.db.select().from(scrapingJobs).where(eq(scrapingJobs.status, 'ACTIVE'));

    return rows.map(JobMapper.rowToEntity);
  }

  async updateJob(id: string, patch: UpdateJobPatch): Promise<ScrapingJobEntity | null> {
    const [row] = await this.db
      .update(scrapingJobs)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(scrapingJobs.id, id))
      .returning();

    return row ? JobMapper.rowToEntity(row) : null;
  }

  async deleteJob(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(scrapingJobs)
      .where(eq(scrapingJobs.id, id))
      .returning({ id: scrapingJobs.id });

    return deleted.length > 0;
  }

  async createRun(input: CreateJobRunInput): Promise<JobRunEntity> {
    const [row] = await this.db
      .insert(jobRuns)
      .values({
        jobId: input.jobId,
        extractedData: input.extractedData ?? null,
        normalizedHash: input.normalizedHash ?? null,
        hasChanges: input.hasChanges,
        status: input.status,
        errorMessage: input.errorMessage ?? null,
        httpStatus: input.httpStatus ?? null,
        durationMs: input.durationMs ?? null,
        screenshotUrl: input.screenshotUrl ?? null,
        ...(input.executedAt ? { executedAt: input.executedAt } : {}),
      })
      .returning();

    if (!row) {
      throw new Error('Failed to insert job run record.');
    }

    return JobMapper.runRowToEntity(row);
  }

  async findRunsByJobId(jobId: string, limit = 50): Promise<JobRunEntity[]> {
    const rows = await this.db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobId, jobId))
      .orderBy(desc(jobRuns.executedAt))
      .limit(limit);

    return rows.map(JobMapper.runRowToEntity);
  }

  async findLatestSuccessfulRun(jobId: string): Promise<JobRunEntity | null> {
    const [row] = await this.db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.jobId, jobId), eq(jobRuns.status, 'SUCCESS')))
      .orderBy(desc(jobRuns.executedAt))
      .limit(1);

    return row ? JobMapper.runRowToEntity(row) : null;
  }

  async deleteUnchangedRunsOlderThan(cutoffDate: Date): Promise<number> {
    const deleted = await this.db
      .delete(jobRuns)
      .where(and(eq(jobRuns.hasChanges, 'NO'), lt(jobRuns.executedAt, cutoffDate)))
      .returning({ id: jobRuns.id });

    return deleted.length;
  }

  async getStats(userId?: string): Promise<DashboardStats> {
    const allJobs = userId
      ? await this.db
          .select({ status: scrapingJobs.status })
          .from(scrapingJobs)
          .where(eq(scrapingJobs.userId, userId))
      : await this.db.select({ status: scrapingJobs.status }).from(scrapingJobs);

    const [runCounts] = userId
      ? await this.db
          .select({
            totalRuns: sql<number>`count(*)::int`,
            changesCount: sql<number>`count(*) filter (where ${jobRuns.hasChanges} = 'YES')::int`,
          })
          .from(jobRuns)
          .innerJoin(scrapingJobs, eq(jobRuns.jobId, scrapingJobs.id))
          .where(eq(scrapingJobs.userId, userId))
      : await this.db
          .select({
            totalRuns: sql<number>`count(*)::int`,
            changesCount: sql<number>`count(*) filter (where ${jobRuns.hasChanges} = 'YES')::int`,
          })
          .from(jobRuns);

    let activeJobs = 0;
    let healingOrCompilingJobs = 0;
    let failedOrPausedJobs = 0;

    for (const j of allJobs) {
      if (j.status === 'ACTIVE') activeJobs++;
      else if (j.status === 'HEALING' || j.status === 'PENDING_COMPILATION')
        healingOrCompilingJobs++;
      else failedOrPausedJobs++;
    }

    return {
      totalJobs: allJobs.length,
      activeJobs,
      healingOrCompilingJobs,
      failedOrPausedJobs,
      totalRuns: runCounts?.totalRuns ?? 0,
      DetectedChangesCount: runCounts?.changesCount ?? 0,
    };
  }
}
