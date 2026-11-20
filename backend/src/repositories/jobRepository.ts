import type { RunProgress } from '../types/run.js';
import { PAGINATION_RUNS_PAGE_SIZE, RunPhase } from '@specter/contracts';
import type { AlertDelivery } from '../notifications/contracts.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, ne } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.js';
import {
  jobRuns,
  scrapingJobs,
  alertDeliveries,
  userMonthlyUsage,
  jobPlanVersions,
} from '../db/schema.js';
import { JobMapper } from '../mappers/jobMapper.js';
import type { PageResult } from '../utils/pagination.js';
import type {
  JobPlanVersionEntity,
  JobRunEntity,
  NewJobPlanVersion,
  ScrapingJobEntity,
  TimeseriesRowEntity,
} from '../types/domain.js';
import type { ExtractionPlan } from '../types/extractionPlan.js';
import type { ExtractedPayload } from '../types/extractor.js';
import { ChangeStatus, JobStatus, RunStatus, parseEnumValue } from '../types/enums.js';
import type { TimeseriesRange } from '@specter/contracts';
import { encryptText } from '../utils/crypto.js';

export interface CreateJobInput {
  userId?: string;
  name?: string;
  url: string;
  userPrompt: string;
  notificationEmail?: string | null;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  cronExpression: string;
  captureScreenshotOnChange?: boolean;
}

export interface UpdateJobPatch {
  name?: string;
  url?: string;
  userPrompt?: string;
  notificationEmail?: string | null;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  cronExpression?: string;
  bullmqRepeatableKey?: string | null;
  contractRevision?: string | null;
  planRevision?: string | null;
  extractionPlan?: ExtractionPlan | null;
  status?: JobStatus;
  lastError?: string | null;
  recoveryAttempts?: number;
  recoveryWindowStartedAt?: Date | null;
  captureScreenshotOnChange?: boolean;
}

export interface CreateJobRunInput extends RunProgress {
  id?: string;
  chargeUsage?: 'execution' | 'compilation';
  jobId: string;
  contractRevision?: string | null;
  extractionReport?: ExtractionReport | null;
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
  recoveringOrCompilingJobs: number;
  failedOrPausedJobs: number;
  totalRuns: number;
  DetectedChangesCount: number;
}

export interface JobRunsSummary {
  totalRuns: number;
  changedRuns: number;
  lastChange: string | null;
  averageDurationMs: number | null;
}

export type PaginatedRunsResult = PageResult<JobRunEntity>;

export interface PaginatedTimeseriesResult extends PageResult<TimeseriesRowEntity> {
  previousItem: TimeseriesRowEntity | null;
}

export interface IJobRepository {
  beginRun(job: ScrapingJobEntity, originQueueId: string): Promise<JobRunEntity | null>;
  findRun(id: string): Promise<JobRunEntity | null>;
  findRunningRuns(): Promise<JobRunEntity[]>;
  findRunningRun(jobId: string): Promise<JobRunEntity | null>;
  cancelRuns(jobId: string): Promise<void>;
  createJob(input: CreateJobInput): Promise<ScrapingJobEntity>;
  findById(id: string): Promise<ScrapingJobEntity | null>;
  findAll(statusFilter?: JobStatus, userId?: string): Promise<ScrapingJobEntity[]>;
  findPage(input: {
    status?: JobStatus | 'recovering' | 'paused';
    userId: string;
    page: number;
    pageSize: number;
    search?: string;
  }): Promise<{ items: ScrapingJobEntity[]; totalItems: number }>;
  findActiveJobs(): Promise<ScrapingJobEntity[]>;
  updateJob(id: string, patch: UpdateJobPatch): Promise<ScrapingJobEntity | null>;
  deleteJob(id: string): Promise<boolean>;
  createRun(input: CreateJobRunInput): Promise<JobRunEntity>;
  commitRun(
    input: CreateJobRunInput,
    deliveries: AlertDelivery[],
    patch?: UpdateJobPatch,
    expectedUpdatedAt?: Date
  ): Promise<JobRunEntity>;
  savePlanVersion(version: NewJobPlanVersion): Promise<JobPlanVersionEntity>;
  getLatestPlanVersionNumber(jobId: string): Promise<number>;
  findPaginatedPlanVersions(
    jobId: string,
    page?: number,
    pageSize?: number
  ): Promise<{ items: JobPlanVersionEntity[]; totalItems: number }>;
  findPlanVersionByNumber(
    jobId: string,
    versionNumber: number
  ): Promise<JobPlanVersionEntity | null>;
  purgeEvidence(cutoffDate: Date): Promise<void>;
  findRunsByJobId(jobId: string, limit?: number): Promise<JobRunEntity[]>;
  findPaginatedRunsByJobId(
    jobId: string,
    page?: number,
    pageSize?: number
  ): Promise<PaginatedRunsResult>;
  findPreviousCompleteCollectionRun(
    jobId: string,
    before: { executedAt: Date; id: string },
    contractRevision: string | null
  ): Promise<JobRunEntity | null>;
  findPaginatedTimeseriesByJobId(
    jobId: string,
    range: TimeseriesRange,
    page: number,
    pageSize: number
  ): Promise<PaginatedTimeseriesResult>;
  getJobRunsSummary(jobId: string): Promise<JobRunsSummary>;
  findLatestSuccessfulRun(jobId: string): Promise<JobRunEntity | null>;
  deleteUnchangedRunsOlderThan(cutoffDate: Date): Promise<number>;
  getStats(userId?: string): Promise<DashboardStats>;
  countActiveJobsByUserId(userId: string): Promise<number>;
}

export class DrizzleJobRepository implements IJobRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDb();
  }

  async findRun(id: string): Promise<JobRunEntity | null> {
    const [row] = await this.db.select().from(jobRuns).where(eq(jobRuns.id, id));
    return row ? JobMapper.runRowToEntity(row) : null;
  }
  async findRunningRuns(): Promise<JobRunEntity[]> {
    return (await this.db.select().from(jobRuns).where(eq(jobRuns.status, RunStatus.Running))).map(
      JobMapper.runRowToEntity
    );
  }
  async findRunningRun(jobId: string): Promise<JobRunEntity | null> {
    const [row] = await this.db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.jobId, jobId), eq(jobRuns.status, RunStatus.Running)))
      .limit(1);
    return row ? JobMapper.runRowToEntity(row) : null;
  }
  async cancelRuns(jobId: string): Promise<void> {
    await this.db
      .update(jobRuns)
      .set({
        status: RunStatus.Cancelled,
        completedAt: new Date(),
        nextAttemptAt: null,
        phase: null,
      })
      .where(and(eq(jobRuns.jobId, jobId), eq(jobRuns.status, RunStatus.Running)));
  }
  async beginRun(job: ScrapingJobEntity, originQueueId: string): Promise<JobRunEntity | null> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(scrapingJobs)
        .where(eq(scrapingJobs.id, job.id))
        .for('update');
      if (
        !current ||
        current.status !== JobStatus.Active ||
        current.updatedAt.getTime() !== job.updatedAt.getTime()
      )
        return null;
      const [existing] = await tx
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.originQueueId, originQueueId));
      if (existing) return JobMapper.runRowToEntity(existing);
      const [row] = await tx
        .insert(jobRuns)
        .values({
          jobId: job.id,
          originQueueId,
          status: RunStatus.Running,
          hasChanges: ChangeStatus.Unchanged,
          phase: RunPhase.Checking,
          startedAt: new Date(),
          monitorUpdatedAt: job.updatedAt,
          metadata: {
            accessAttempts: 0,
            confirmations: 0,
            recoveryAttempts: 0,
            compilationAttempts: 0,
            reasons: [],
          },
        })
        .onConflictDoNothing()
        .returning();
      return row ? JobMapper.runRowToEntity(row) : null;
    });
  }
  async createJob(input: CreateJobInput): Promise<ScrapingJobEntity> {
    const [row] = await this.db
      .insert(scrapingJobs)
      .values({
        userId: input.userId ?? '00000000-0000-0000-0000-000000000000',
        url: input.url,
        name: input.name ?? 'Monitor 1',
        userPrompt: input.userPrompt,
        notificationEmail: input.notificationEmail ?? null,
        webhookUrl: input.webhookUrl ?? null,
        webhookSecret: input.webhookSecret != null ? encryptText(input.webhookSecret) : null,
        cronExpression: input.cronExpression,
        captureScreenshotOnChange: input.captureScreenshotOnChange ?? false,
        status: JobStatus.PendingCompilation,
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

  async findPage(input: {
    status?: JobStatus | 'recovering' | 'paused';
    userId: string;
    page: number;
    pageSize: number;
    search?: string;
  }): Promise<{ items: ScrapingJobEntity[]; totalItems: number }> {
    const conditions = [eq(scrapingJobs.userId, input.userId)];
    if (input.status === 'recovering')
      conditions.push(
        inArray(scrapingJobs.status, [JobStatus.Recovering, JobStatus.PendingCompilation])
      );
    else if (input.status === 'paused')
      conditions.push(inArray(scrapingJobs.status, [JobStatus.Paused, JobStatus.Failed]));
    else if (input.status) conditions.push(eq(scrapingJobs.status, input.status));
    const search = input.search?.trim();
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(
        or(
          ilike(scrapingJobs.name, pattern),
          ilike(scrapingJobs.url, pattern),
          ilike(scrapingJobs.userPrompt, pattern)
        )!
      );
    }
    const where = and(...conditions);
    const [items, [total]] = await Promise.all([
      this.db
        .select()
        .from(scrapingJobs)
        .where(where)
        .orderBy(desc(scrapingJobs.createdAt), asc(scrapingJobs.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db.select({ value: count() }).from(scrapingJobs).where(where),
    ]);
    return { items: items.map(JobMapper.rowToEntity), totalItems: total?.value ?? 0 };
  }

  async findActiveJobs(): Promise<ScrapingJobEntity[]> {
    const rows = await this.db
      .select()
      .from(scrapingJobs)
      .where(eq(scrapingJobs.status, JobStatus.Active));

    return rows.map(JobMapper.rowToEntity);
  }

  async updateJob(id: string, patch: UpdateJobPatch): Promise<ScrapingJobEntity | null> {
    const encryptedPatch = {
      ...patch,
      ...(patch.webhookSecret !== undefined
        ? {
            webhookSecret: patch.webhookSecret != null ? encryptText(patch.webhookSecret) : null,
          }
        : {}),
    };

    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ updatedAt: scrapingJobs.updatedAt })
        .from(scrapingJobs)
        .where(eq(scrapingJobs.id, id))
        .for('update');
      if (!current) return null;
      await tx
        .update(jobRuns)
        .set({
          status: RunStatus.Cancelled,
          completedAt: new Date(),
          nextAttemptAt: null,
          phase: null,
        })
        .where(and(eq(jobRuns.jobId, id), eq(jobRuns.status, RunStatus.Running)));
      const [row] = await tx
        .update(scrapingJobs)
        .set({
          ...encryptedPatch,
          updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
        })
        .where(eq(scrapingJobs.id, id))
        .returning();
      return row ? JobMapper.rowToEntity(row) : null;
    });
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
        contractRevision: input.contractRevision,
        extractionReport: input.extractionReport ?? null,
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

  async commitRun(
    input: CreateJobRunInput,
    deliveries: AlertDelivery[],
    patch?: UpdateJobPatch,
    expectedUpdatedAt?: Date
  ): Promise<JobRunEntity> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          updatedAt: scrapingJobs.updatedAt,
          status: scrapingJobs.status,
          userId: scrapingJobs.userId,
        })
        .from(scrapingJobs)
        .where(eq(scrapingJobs.id, input.jobId))
        .for('update');
      if (
        !current ||
        current.status === JobStatus.Paused ||
        (expectedUpdatedAt && current.updatedAt.getTime() !== expectedUpdatedAt.getTime())
      )
        throw new Error('Monitor changed during execution; stale snapshot discarded.');
      const { chargeUsage, ...values } = input;
      if (input.id) {
        const [existing] = await tx
          .select()
          .from(jobRuns)
          .where(eq(jobRuns.id, input.id))
          .for('update');
        if (!existing || existing.jobId !== input.jobId) throw new Error('Run not found.');
        if (existing.status !== RunStatus.Running) return JobMapper.runRowToEntity(existing);
      }
      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      const persisted = {
        ...values,
        ...(patch ? { monitorUpdatedAt: updatedAt } : {}),
        ...(input.status !== RunStatus.Running
          ? { completedAt: updatedAt, nextAttemptAt: null, phase: null }
          : {}),
      };
      const [row] = input.id
        ? await tx.update(jobRuns).set(persisted).where(eq(jobRuns.id, input.id)).returning()
        : await tx.insert(jobRuns).values(persisted).returning();
      if (!row) throw new Error('Failed to persist snapshot.');
      if (patch)
        await tx
          .update(scrapingJobs)
          .set({ ...patch, updatedAt })
          .where(eq(scrapingJobs.id, input.jobId));
      if (chargeUsage) {
        const period = updatedAt.toISOString().slice(0, 7);
        const column =
          chargeUsage === 'compilation'
            ? userMonthlyUsage.compilationsCount
            : userMonthlyUsage.executionsCount;
        const key = chargeUsage === 'compilation' ? 'compilationsCount' : 'executionsCount';
        await tx
          .insert(userMonthlyUsage)
          .values({ userId: current.userId, period, [key]: 1 })
          .onConflictDoUpdate({
            target: [userMonthlyUsage.userId, userMonthlyUsage.period],
            set: { [key]: sql`${column} + 1`, updatedAt },
          });
      }
      if (deliveries.length)
        await tx
          .insert(alertDeliveries)
          .values(
            deliveries.map((delivery) => ({ ...delivery, runId: row.id, jobId: input.jobId }))
          )
          .onConflictDoNothing();
      if (patch?.extractionPlan) {
        const [maxVerRow] = await tx
          .select({
            maxVersion: sql<number>`COALESCE(MAX(${jobPlanVersions.versionNumber}), 0)::int`,
          })
          .from(jobPlanVersions)
          .where(eq(jobPlanVersions.jobId, input.jobId));
        const nextVersion = (maxVerRow?.maxVersion ?? 0) + 1;

        const [jobRow] = await tx
          .select({ url: scrapingJobs.url, userPrompt: scrapingJobs.userPrompt })
          .from(scrapingJobs)
          .where(eq(scrapingJobs.id, input.jobId));

        if (jobRow) {
          await tx.insert(jobPlanVersions).values({
            jobId: input.jobId,
            versionNumber: nextVersion,
            planRevision: patch.planRevision ?? `v${nextVersion}`,
            contractRevision: patch.contractRevision ?? null,
            url: jobRow.url,
            userPrompt: jobRow.userPrompt,
            extractionPlan: patch.extractionPlan,
            triggerReason: input.recoveredAutomatically ? 'recovery' : 'compilation',
            createdByRunId: row.id,
            createdAt: updatedAt,
          });
        }
      }
      return JobMapper.runRowToEntity(row);
    });
  }

  async purgeEvidence(cutoffDate: Date): Promise<void> {
    await this.db
      .update(jobRuns)
      .set({ extractionReport: sql`extraction_report - 'evidence'` })
      .where(lt(jobRuns.executedAt, cutoffDate));
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

  async findPaginatedRunsByJobId(
    jobId: string,
    page = 1,
    pageSize = PAGINATION_RUNS_PAGE_SIZE
  ): Promise<PaginatedRunsResult> {
    const offset = Math.max(0, (page - 1) * pageSize);

    const [countResult, rows] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobRuns)
        .where(eq(jobRuns.jobId, jobId)),
      this.db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.jobId, jobId))
        .orderBy(desc(jobRuns.executedAt), desc(jobRuns.id))
        .limit(pageSize)
        .offset(offset),
    ]);

    return {
      items: rows.map(JobMapper.runRowToEntity),
      totalItems: countResult[0]?.count ?? 0,
    };
  }

  async findPreviousCompleteCollectionRun(
    jobId: string,
    before: { executedAt: Date; id: string },
    contractRevision: string | null
  ): Promise<JobRunEntity | null> {
    const conditions = [
      eq(jobRuns.jobId, jobId),
      eq(jobRuns.status, RunStatus.Success),
      contractRevision === null
        ? sql`${jobRuns.contractRevision} is null`
        : eq(jobRuns.contractRevision, contractRevision),
      sql`${jobRuns.extractionReport}->>'coverage' in ('COMPLETE', 'EMPTY')`,
      or(
        lt(jobRuns.executedAt, before.executedAt),
        and(eq(jobRuns.executedAt, before.executedAt), lt(jobRuns.id, before.id))
      )!,
    ];
    const [row] = await this.db
      .select()
      .from(jobRuns)
      .where(and(...conditions))
      .orderBy(desc(jobRuns.executedAt), desc(jobRuns.id))
      .limit(1);
    return row ? JobMapper.runRowToEntity(row) : null;
  }

  async findPaginatedTimeseriesByJobId(
    jobId: string,
    range: TimeseriesRange,
    page: number,
    pageSize: number
  ): Promise<PaginatedTimeseriesResult> {
    const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : range === '30d' ? 24 * 30 : null;
    const cutoffDate = hours ? new Date(Date.now() - hours * 3600 * 1000) : null;

    const conditions = [eq(jobRuns.jobId, jobId), eq(jobRuns.status, RunStatus.Success)];
    if (cutoffDate) {
      conditions.push(gte(jobRuns.executedAt, cutoffDate));
    }

    const selection = {
      id: jobRuns.id,
      executedAt: jobRuns.executedAt,
      status: jobRuns.status,
      hasChanges: jobRuns.hasChanges,
      durationMs: jobRuns.durationMs,
      contractRevision: jobRuns.contractRevision,
      errorMessage: jobRuns.errorMessage,
      extractedData: jobRuns.extractedData,
    };
    const where = and(...conditions);
    const offset = (page - 1) * pageSize;
    const [rows, [countRow]] = await Promise.all([
      this.db
        .select(selection)
        .from(jobRuns)
        .where(where)
        .orderBy(desc(jobRuns.executedAt), desc(jobRuns.id))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ total: count() }).from(jobRuns).where(where),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      executedAt: row.executedAt,
      status: parseEnumValue(RunStatus, row.status, 'run status'),
      hasChanges: parseEnumValue(ChangeStatus, row.hasChanges, 'change status'),
      durationMs: row.durationMs,
      contractRevision: row.contractRevision,
      errorMessage: row.errorMessage,
      extractedData: row.extractedData,
    }));
    const oldest = rows.at(-1);
    const previousRow = oldest
      ? (
          await this.db
            .select(selection)
            .from(jobRuns)
            .where(
              and(
                ...conditions,
                or(
                  lt(jobRuns.executedAt, oldest.executedAt),
                  and(eq(jobRuns.executedAt, oldest.executedAt), lt(jobRuns.id, oldest.id))
                )
              )
            )
            .orderBy(desc(jobRuns.executedAt), desc(jobRuns.id))
            .limit(1)
        )[0]
      : undefined;
    const previousItem = previousRow
      ? {
          id: previousRow.id,
          executedAt: previousRow.executedAt,
          status: parseEnumValue(RunStatus, previousRow.status, 'run status'),
          hasChanges: parseEnumValue(ChangeStatus, previousRow.hasChanges, 'change status'),
          durationMs: previousRow.durationMs,
          contractRevision: previousRow.contractRevision,
          errorMessage: previousRow.errorMessage,
          extractedData: previousRow.extractedData,
        }
      : null;

    return { items, previousItem, totalItems: countRow?.total ?? 0 };
  }

  async getJobRunsSummary(jobId: string): Promise<JobRunsSummary> {
    const [stats] = await this.db
      .select({
        totalRuns: sql<number>`count(*) filter (where ${jobRuns.status} not in ('RUNNING', 'CANCELLED'))::int`,
        changedRuns: sql<number>`count(*) filter (where ${jobRuns.hasChanges} = ${ChangeStatus.Changed})::int`,
        lastChange: sql<Date | null>`max(case when ${jobRuns.hasChanges} = ${ChangeStatus.Changed} then ${jobRuns.executedAt} else null end)`,
        averageDurationMs: sql<
          number | null
        >`round(avg(case when ${jobRuns.status} = ${RunStatus.Success} and ${jobRuns.durationMs} is not null then ${jobRuns.durationMs} else null end))::int`,
      })
      .from(jobRuns)
      .where(eq(jobRuns.jobId, jobId));

    return {
      totalRuns: stats?.totalRuns ?? 0,
      changedRuns: stats?.changedRuns ?? 0,
      lastChange: stats?.lastChange ? new Date(stats.lastChange).toISOString() : null,
      averageDurationMs: stats?.averageDurationMs ?? null,
    };
  }

  async findLatestSuccessfulRun(jobId: string): Promise<JobRunEntity | null> {
    const [row] = await this.db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.jobId, jobId), eq(jobRuns.status, RunStatus.Success)))
      .orderBy(desc(jobRuns.executedAt))
      .limit(1);

    return row ? JobMapper.runRowToEntity(row) : null;
  }

  async deleteUnchangedRunsOlderThan(cutoffDate: Date): Promise<number> {
    const deleted = await this.db
      .delete(jobRuns)
      .where(
        and(
          ne(jobRuns.status, RunStatus.Running),
          eq(jobRuns.hasChanges, ChangeStatus.Unchanged),
          lt(jobRuns.executedAt, cutoffDate)
        )
      )
      .returning({ id: jobRuns.id });

    return deleted.length;
  }

  async getStats(userId?: string): Promise<DashboardStats> {
    const [jobStatsRows, runCountsRows] = await Promise.all([
      userId
        ? this.db
            .select({
              totalJobs: sql<number>`count(*)::int`,
              activeJobs: sql<number>`count(*) filter (where ${scrapingJobs.status} = ${JobStatus.Active})::int`,
              recoveringOrCompilingJobs: sql<number>`count(*) filter (where ${scrapingJobs.status} in (${JobStatus.Recovering}, ${JobStatus.PendingCompilation}))::int`,
              failedOrPausedJobs: sql<number>`count(*) filter (where ${scrapingJobs.status} in (${JobStatus.Failed}, ${JobStatus.Paused}))::int`,
            })
            .from(scrapingJobs)
            .where(eq(scrapingJobs.userId, userId))
        : this.db
            .select({
              totalJobs: sql<number>`count(*)::int`,
              activeJobs: sql<number>`count(*) filter (where ${scrapingJobs.status} = ${JobStatus.Active})::int`,
              recoveringOrCompilingJobs: sql<number>`count(*) filter (where ${scrapingJobs.status} in (${JobStatus.Recovering}, ${JobStatus.PendingCompilation}))::int`,
              failedOrPausedJobs: sql<number>`count(*) filter (where ${scrapingJobs.status} in (${JobStatus.Failed}, ${JobStatus.Paused}))::int`,
            })
            .from(scrapingJobs),
      userId
        ? this.db
            .select({
              totalRuns: sql<number>`count(*) filter (where ${jobRuns.status} not in ('RUNNING', 'CANCELLED'))::int`,
              changesCount: sql<number>`count(*) filter (where ${jobRuns.hasChanges} = ${ChangeStatus.Changed})::int`,
            })
            .from(jobRuns)
            .innerJoin(scrapingJobs, eq(jobRuns.jobId, scrapingJobs.id))
            .where(eq(scrapingJobs.userId, userId))
        : this.db
            .select({
              totalRuns: sql<number>`count(*) filter (where ${jobRuns.status} not in ('RUNNING', 'CANCELLED'))::int`,
              changesCount: sql<number>`count(*) filter (where ${jobRuns.hasChanges} = ${ChangeStatus.Changed})::int`,
            })
            .from(jobRuns),
    ]);

    const jobCounts = jobStatsRows[0];
    const runCounts = runCountsRows[0];

    return {
      totalJobs: jobCounts?.totalJobs ?? 0,
      activeJobs: jobCounts?.activeJobs ?? 0,
      recoveringOrCompilingJobs: jobCounts?.recoveringOrCompilingJobs ?? 0,
      failedOrPausedJobs: jobCounts?.failedOrPausedJobs ?? 0,
      totalRuns: runCounts?.totalRuns ?? 0,
      DetectedChangesCount: runCounts?.changesCount ?? 0,
    };
  }

  async countActiveJobsByUserId(userId: string): Promise<number> {
    const [row] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(scrapingJobs)
      .where(and(eq(scrapingJobs.userId, userId), ne(scrapingJobs.status, JobStatus.Paused)));

    return row?.count ?? 0;
  }

  async savePlanVersion(version: NewJobPlanVersion): Promise<JobPlanVersionEntity> {
    const [row] = await this.db.insert(jobPlanVersions).values(version).returning();
    if (!row) throw new Error('Failed to save job plan version.');
    return JobMapper.planVersionRowToEntity(row);
  }

  async getLatestPlanVersionNumber(jobId: string): Promise<number> {
    const [row] = await this.db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${jobPlanVersions.versionNumber}), 0)::int` })
      .from(jobPlanVersions)
      .where(eq(jobPlanVersions.jobId, jobId));
    return row?.maxVersion ?? 0;
  }

  async findPaginatedPlanVersions(
    jobId: string,
    page = 1,
    pageSize = 10
  ): Promise<{ items: JobPlanVersionEntity[]; totalItems: number }> {
    const offset = Math.max(0, (page - 1) * pageSize);
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobPlanVersions)
      .where(eq(jobPlanVersions.jobId, jobId));
    const totalItems = countResult?.count ?? 0;

    const rows = await this.db
      .select()
      .from(jobPlanVersions)
      .where(eq(jobPlanVersions.jobId, jobId))
      .orderBy(desc(jobPlanVersions.versionNumber))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map(JobMapper.planVersionRowToEntity),
      totalItems,
    };
  }

  async findPlanVersionByNumber(
    jobId: string,
    versionNumber: number
  ): Promise<JobPlanVersionEntity | null> {
    const [row] = await this.db
      .select()
      .from(jobPlanVersions)
      .where(
        and(eq(jobPlanVersions.jobId, jobId), eq(jobPlanVersions.versionNumber, versionNumber))
      )
      .limit(1);
    return row ? JobMapper.planVersionRowToEntity(row) : null;
  }
}
