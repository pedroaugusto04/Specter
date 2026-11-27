import { eq } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { Database } from '../../src/db/index.js';
import { DrizzleJobRepository } from '../../src/repositories/jobRepository.js';
import { DrizzleOutboxRepository } from '../../src/repositories/outboxRepository.js';
import { OutboxWorker } from '../../src/notifications/outboxWorker.js';
import { users, alertDeliveries } from '../../src/db/schema.js';
import type { AlertDelivery } from '../../src/notifications/contracts.js';
import { fixturePlan } from '../helpers/extractionFixtures.js';
let pg: PGlite;
let db: ReturnType<typeof drizzle>;
let repository: DrizzleJobRepository;
let outbox: DrizzleOutboxRepository;
let owner: string;
const migratedJobs: string[] = [];
let legacyHealingJob: string;
let historicalRun: string;
beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg);
  const migrations = (await readdir('drizzle/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of migrations) {
    if (file.startsWith('0009')) {
      const legacyOwner = randomUUID();
      await pg.exec(`INSERT INTO users (id,email) VALUES ('${legacyOwner}','legacy@example.com')`);
      for (const status of ['ACTIVE', 'PAUSED', 'FAILED', 'HEALING']) {
        const id = randomUUID();
        migratedJobs.push(id);
        await pg.exec(
          `INSERT INTO scraping_jobs (id,user_id,url,user_prompt,notification_email,status,extractor_config) VALUES ('${id}','${legacyOwner}','https://example.com','Old request','','${status}','{"version":2}'::jsonb)`
        );
      }
      historicalRun = randomUUID();
      await pg.exec(
        `INSERT INTO job_runs (id,job_id,has_changes,status,extracted_data) VALUES ('${historicalRun}','${migratedJobs[0]}','INITIAL','SUCCESS','{"title":"Historical"}'::jsonb)`
      );
    }
    if (file.startsWith('0016')) {
      const legacyOwner = randomUUID();
      legacyHealingJob = randomUUID();
      await pg.exec(`INSERT INTO users (id,email) VALUES ('${legacyOwner}','healing@example.com')`);
      await pg.exec(
        `INSERT INTO scraping_jobs (id,user_id,url,name,user_prompt,notification_email,status) VALUES ('${legacyHealingJob}','${legacyOwner}','https://example.com','Old monitor','Old recovery','','HEALING')`
      );
    }
    await pg.exec(await readFile('drizzle/migrations/' + file, 'utf8'));
  }
  repository = new DrizzleJobRepository(db as unknown as Database);
  outbox = new DrizzleOutboxRepository(db as unknown as Database);
  owner = randomUUID();
  await db.insert(users).values({ id: owner, email: 'test@example.com' });
}, 30000);
afterAll(async () => {
  await pg?.close();
});
async function monitor() {
  const job = await repository.createJob({
    userId: owner,
    name: `Monitor ${randomUUID()}`,
    url: 'https://example.com',
    userPrompt: 'Watch title',
    notificationEmail: 'test@example.com',
    cronExpression: '0 */6 * * *',
  });
  return (await repository.updateJob(job.id, {
    status: 'ACTIVE',
    extractionPlan: fixturePlan(),
    contractRevision: randomUUID(),
  }))!;
}
function delivery(jobId: string): AlertDelivery {
  return {
    channel: 'email',
    destination: 'test@example.com',
    payload: {
      jobId,
      userId: owner,
      targetUrl: 'https://example.com',
      subject: 'Changed',
      diffSummary: {
        hasChanges: true,
        totalChanges: 1,
        added: [],
        removed: [],
        modified: [],
        summaryText: 'Changed',
      },
      data: { title: 'New' },
    },
  };
}
describe('PostgreSQL migrations and transactional outbox', () => {
  it('invalidates old plans while preserving inactive status and historical snapshots', async () => {
    const jobs = await Promise.all(migratedJobs.map((id) => repository.findById(id)));
    expect(jobs.map((job) => job?.status)).toEqual([
      'PENDING_COMPILATION',
      'PAUSED',
      'FAILED',
      'PENDING_COMPILATION',
    ]);
    expect(jobs.every((job) => job?.extractionPlan === null)).toBe(true);
    const history = await repository.findRunsByJobId(migratedJobs[0]!);
    expect(history[0]?.id).toBe(historicalRun);
    expect(history[0]?.extractedData).toEqual({ title: 'Historical' });
  });
  it('renames the persisted healing state to recovering', async () => {
    expect((await repository.findById(legacyHealingJob))?.status).toBe('RECOVERING');
  });
  it('rolls back snapshot and job update if an outbox insert fails', async () => {
    const job = await monitor();
    await expect(
      repository.commitRun(
        { jobId: job.id, status: 'SUCCESS', hasChanges: 'YES' },
        [{ ...delivery(job.id), destination: null as unknown as string }],
        { lastError: 'must rollback' },
        job.updatedAt
      )
    ).rejects.toThrow();
    expect(await repository.findRunsByJobId(job.id)).toHaveLength(0);
    expect((await repository.findById(job.id))?.lastError).toBeNull();
  });
  it('atomically saves a snapshot and retries only failed channels', async () => {
    const job = await monitor();
    const first = delivery(job.id);
    await repository.commitRun(
      { jobId: job.id, status: 'SUCCESS', hasChanges: 'YES' },
      [first, { ...first, channel: 'telegram', destination: '123' }],
      undefined,
      job.updatedAt
    );
    expect(await repository.findRunsByJobId(job.id)).toHaveLength(1);
    const sends: string[] = [];
    const worker = new OutboxWorker(
      outbox,
      {
        deliver: async (item) => {
          sends.push(item.channel);
          if (item.channel === 'telegram') throw new Error('Temporary outage');
        },
      },
      3
    );
    await worker.tick();
    let rows = await db.select().from(alertDeliveries);
    expect(rows.filter((row) => row.status === 'SENT')).toHaveLength(1);
    expect(rows.find((row) => row.channel === 'telegram')?.status).toBe('PENDING');
    await pg.exec(
      "UPDATE alert_deliveries SET next_attempt_at=now() - interval '1 minute' WHERE status='PENDING'"
    );
    const restarted = new OutboxWorker(
      new DrizzleOutboxRepository(db as unknown as Database),
      {
        deliver: async (item) => {
          sends.push(item.channel);
        },
      },
      3
    );
    await restarted.tick();
    rows = await db.select().from(alertDeliveries);
    expect(rows.filter((row) => row.status === 'SENT')).toHaveLength(2);
    expect(sends).toEqual(['email', 'telegram', 'telegram']);
  });
  it('bounds retries even when a worker dies after claiming a delivery', async () => {
    const job = await monitor();
    await repository.commitRun(
      { jobId: job.id, status: 'SUCCESS', hasChanges: 'YES' },
      [delivery(job.id)],
      undefined,
      job.updatedAt
    );
    const claimed = await outbox.claim(10, 1);
    expect(claimed.filter((item) => item.payload.jobId === job.id)).toHaveLength(1);
    await db
      .update(alertDeliveries)
      .set({ lockedUntil: new Date('2020-01-01') })
      .where(eq(alertDeliveries.jobId, job.id));
    const attempts: string[] = [];
    await new OutboxWorker(
      outbox,
      {
        deliver: async (item) => {
          attempts.push(item.destination);
        },
      },
      1
    ).tick();
    const rows = await db.select().from(alertDeliveries).where(eq(alertDeliveries.jobId, job.id));
    expect(rows[0]?.status).toBe('FAILED');
    expect(rows[0]?.attempts).toBe(1);
    expect(attempts).toEqual([]);
  });
  it('discards a snapshot after a monitor was paused or edited', async () => {
    const job = await monitor();
    await repository.updateJob(job.id, { status: 'PAUSED' });
    await expect(
      repository.commitRun(
        { jobId: job.id, status: 'SUCCESS', hasChanges: 'YES' },
        [delivery(job.id)],
        undefined,
        job.updatedAt
      )
    ).rejects.toThrow('stale');
    expect(await repository.findRunsByJobId(job.id)).toHaveLength(0);
  });
  it('expires provenance without deleting snapshots or evaluations', async () => {
    const job = await monitor();
    await repository.createRun({
      jobId: job.id,
      status: 'SUCCESS',
      hasChanges: 'INITIAL',
      executedAt: new Date('2020-01-01'),
      extractionReport: {
        quality: 'COMPLETE',
        scope: 'page',
        pagesVisited: 1,
        issues: [],
        sourcesUsed: {},
        evidence: [],
        semanticReview: { status: 'SKIPPED', score: null, reasons: [], evidenceRefs: [] },
      },
    });
    await repository.purgeEvidence(new Date('2021-01-01'));
    const rows = await repository.findRunsByJobId(job.id);
    expect(rows[0]?.extractionReport?.evidence).toBeUndefined();
    expect(rows[0]?.extractionReport?.semanticReview?.status).toBe('SKIPPED');
  });
});

describe('Persisted execution cycles', () => {
  it('deduplicates delivery, prevents overlap, and atomically finalizes usage and alerts', async () => {
    const job = await monitor();
    const origin = randomUUID();
    const run = (await repository.beginRun(job, origin))!;
    expect((await repository.beginRun(job, origin))!.id).toBe(run.id);
    expect(await repository.beginRun(job, randomUUID())).toBeNull();
    const result = {
      jobId: job.id,
      id: run.id,
      status: 'SUCCESS' as const,
      hasChanges: 'YES' as const,
      chargeUsage: 'compilation' as const,
      recoveredAutomatically: true,
    };
    await repository.commitRun(result, [delivery(job.id)], undefined, job.updatedAt);
    await repository.commitRun(result, [delivery(job.id)], undefined, job.updatedAt);
    expect(await repository.findRunsByJobId(job.id)).toHaveLength(1);
    const rows = await db.select().from(alertDeliveries).where(eq(alertDeliveries.runId, run.id));
    expect(rows).toHaveLength(1);
    const { DrizzleUsageRepository } = await import('../../src/repositories/usageRepository.js');
    const usage = await new DrizzleUsageRepository(db as unknown as Database).getUsage(job.userId);
    expect(usage.compilationsCount).toBe(1);
    expect((await repository.findRun(run.id))?.completedAt).toBeInstanceOf(Date);
  });
  it('cancels a run atomically on edit and rejects a late commit', async () => {
    const job = await monitor();
    const run = (await repository.beginRun(job, randomUUID()))!;
    await repository.updateJob(job.id, { userPrompt: 'Changed request' });
    expect((await repository.findRun(run.id))?.status).toBe('CANCELLED');
    await expect(
      repository.commitRun(
        { ...run, status: 'SUCCESS' },
        [delivery(job.id)],
        { status: 'ACTIVE' },
        job.updatedAt
      )
    ).rejects.toThrow();
    expect((await repository.findById(job.id))?.userPrompt).toBe('Changed request');
  });
  it('retention preserves ongoing cycles and excludes them from completed statistics', async () => {
    const job = await monitor();
    const run = (await repository.beginRun(job, randomUUID()))!;
    await repository.deleteUnchangedRunsOlderThan(new Date(Date.now() + 86400000));
    expect(await repository.findRun(run.id)).not.toBeNull();
    expect((await repository.getJobRunsSummary(job.id)).totalRuns).toBe(0);
  });
});

describe('Database-backed pagination', () => {
  it('uses stable bounded pages and supplies the preceding valid reading as context', async () => {
    const job = await monitor();
    const base = Date.now();
    const runIds: string[] = [];
    for (let index = 1; index <= 3; index += 1) {
      const run = await repository.createRun({
        jobId: job.id,
        status: 'SUCCESS',
        hasChanges: 'NO',
        contractRevision: job.contractRevision,
        extractedData: { items: [], count: 0 },
        executedAt: new Date(base + index * 1000),
        extractionReport: {
          quality: 'COMPLETE',
          scope: 'collection',
          coverage: 'COMPLETE',
          pagesVisited: 1,
          issues: [],
          sourcesUsed: {},
        },
      });
      runIds.push(run.id);
    }

    const firstPage = await repository.findPaginatedTimeseriesByJobId(job.id, 'all', 1, 2);
    expect(firstPage.items.map((point) => point.id)).toEqual([runIds[2], runIds[1]]);
    expect(firstPage.totalItems).toBe(3);
    expect(firstPage.previousItem?.id).toBe(runIds[0]);

    const priorCollection = await repository.findPreviousCompleteCollectionRun(
      job.id,
      { executedAt: firstPage.items[1]!.executedAt, id: firstPage.items[1]!.id },
      job.contractRevision ?? null
    );
    expect(priorCollection?.id).toBe(runIds[0]);

    const filteredPage = await repository.findPage({
      userId: owner,
      page: 1,
      pageSize: 1,
      search: job.name,
      status: 'ACTIVE',
    });
    expect(filteredPage.totalItems).toBe(1);
    expect(filteredPage.items[0]?.id).toBe(job.id);
  });
});
