import { describe, it, expect } from 'vitest';
import { Worker } from 'bullmq';
import {
  BullMqJobScheduler,
  SCRAPE_EXECUTION_QUEUE_NAME,
  COMPILATION_QUEUE_NAME,
} from '../../src/queues/queues.js';
import { reconcileRuns } from '../../src/queues/runReconciler.js';
import {
  createTestCompilationService,
  createTestScrapeExecutionService,
  InMemoryJobRepository,
  MockNotificationProvider,
  MockScraperEngine,
  MockCompilerProvider,
} from '../helpers/testDoubles.js';
import {
  fixtureExecutor,
  fixtureConfiguration,
  fixturePlan,
} from '../helpers/extractionFixtures.js';
import { ScrapeExecutionService } from '../../src/services/scrapeExecutionService.js';
import { CompilationService } from '../../src/services/compilationService.js';
import { NoopStorageProvider } from '../../src/providers/storage/noopStorage.provider.js';
import { randomUUID } from 'node:crypto';

// Run against a dedicated disposable Redis, never a deployment's queue database.
describe.skipIf(!process.env.RECOVERY_TEST_REDIS_PORT)(
  'Recovery queue handoff with real Redis',
  () => {
    it('reconciles missing work, preserves delayed tasks, and finishes recovery once across queues', async () => {
      const connection = { host: '127.0.0.1', port: Number(process.env.RECOVERY_TEST_REDIS_PORT) };
      const scheduler = new BullMqJobScheduler(connection);
      await scheduler.scrapeQueue.obliterate({ force: true });
      await scheduler.compilationQueue.obliterate({ force: true });
      const repo = new InMemoryJobRepository();
      const scraper = new MockScraperEngine();
      const compiler = new MockCompilerProvider();
      let broken = true;
      scraper.setHandler(async (url) => ({
        url,
        httpStatus: 200,
        durationMs: 1,
        rawHtml: broken ? '<body>broken</body>' : '<body><h1>Title</h1></body>',
      }));
      compiler.setHandler(async () => {
        broken = false;
        return fixturePlan();
      });
      const shared = {
        jobRepository: repo,
        jobScheduler: scheduler,
        alertRouter: new MockNotificationProvider(),
        storageProvider: new NoopStorageProvider(),
      };
      const execute = createTestScrapeExecutionService({
        ...shared,
        planExecutor: fixtureExecutor(scraper),
      });
      const compile = createTestCompilationService({
        ...shared,
        configurationPipeline: fixtureConfiguration(compiler, scraper),
      });
      const job = await repo.createJob({
        url: 'https://example.com',
        userPrompt: 'title',
        cronExpression: '0 0 * * *',
      });
      const active = (await repo.updateJob(job.id, {
        status: 'ACTIVE',
        extractionPlan: fixturePlan(),
      }))!;
      const run = (await repo.beginRun(active, randomUUID()))!;
      await repo.commitRun(
        { ...run, nextAttemptAt: new Date(Date.now() + 1500) },
        [],
        undefined,
        active.updatedAt
      );
      await reconcileRuns(repo, scheduler);
      const taskId = `run-${run.id}-0`;
      expect(await scheduler.scrapeQueue.getJob(taskId)).toBeDefined();
      await reconcileRuns(repo, scheduler);
      expect(await scheduler.scrapeQueue.getJobCounts('delayed')).toMatchObject({ delayed: 1 });
      const scrapeWorker = new Worker(
        SCRAPE_EXECUTION_QUEUE_NAME,
        (task) => execute.executeScrape(task.data.jobId, task.id, task.data.runId),
        { connection }
      );
      const compilationWorker = new Worker(
        COMPILATION_QUEUE_NAME,
        (task) => compile.compileJob(task.data.jobId, task.data.reason, false, task.data.runId),
        { connection }
      );
      try {
        await expect
          .poll(async () => (await repo.findRun(run.id))?.status, { timeout: 5000 })
          .toBe('SUCCESS');
        await scheduler.enqueueCompilation(job.id, 'recovery', run.id);
        expect(repo.runs).toHaveLength(1);
        expect(compiler.calls).toHaveLength(1);
        expect((await repo.findRun(run.id))?.recoveredAutomatically).toBe(true);
      } finally {
        await scrapeWorker.close();
        await compilationWorker.close();
        await scheduler.compilationQueue.obliterate({ force: true });
        await scheduler.scrapeQueue.obliterate({ force: true });
        await scheduler.close();
      }
    });
  }
);
