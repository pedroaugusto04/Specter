import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTestCompilationService,
  createTestScrapeExecutionService,
  InMemoryJobRepository,
  InMemoryUsageRepository,
  MockJobScheduler,
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
import {
  NavigationTimeoutError,
  AntiBotBlockedError,
  UpstreamHttpError,
  CompilerApiRequestError,
  UnsupportedCapabilityError,
} from '../../src/errors/domainErrors.js';
import { env } from '../../src/config/env.js';

describe('One persisted result per execution cycle', () => {
  let repo: InMemoryJobRepository;
  let scheduler: MockJobScheduler;
  let scraper: MockScraperEngine;
  let compiler: MockCompilerProvider;
  let execute: ScrapeExecutionService;
  let compile: CompilationService;
  let jobId: string;
  beforeEach(async () => {
    repo = new InMemoryJobRepository();
    repo.usageRepository = new InMemoryUsageRepository();
    scheduler = new MockJobScheduler();
    scraper = new MockScraperEngine();
    compiler = new MockCompilerProvider();
    const shared = {
      jobRepository: repo,
      jobScheduler: scheduler,
      alertRouter: new MockNotificationProvider(),
      storageProvider: new NoopStorageProvider(),
    };
    execute = createTestScrapeExecutionService({ ...shared, planExecutor: fixtureExecutor(scraper) });
    compile = createTestCompilationService({
      ...shared,
      configurationPipeline: fixtureConfiguration(compiler, scraper),
    });
    const job = await repo.createJob({
      url: 'https://example.com/item',
      userPrompt: 'Title',
      cronExpression: '0 0 * * *',
    });
    jobId = job.id;
    await repo.updateJob(jobId, { status: 'ACTIVE', extractionPlan: fixturePlan() });
  });
  afterEach(() => vi.useRealTimers());
  async function retry() {
    const run = repo.runs[0]!;
    vi.useRealTimers();
    run.nextAttemptAt = new Date(Date.now() - 1);
    return execute.executeScrape(jobId, 'retry', run.id);
  }
  it('recovers a network failure without LLM, extra runs, or duplicate usage on replay', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    scraper.setHandler(async () => {
      throw new NavigationTimeoutError('timeout');
    });
    await execute.executeScrape(jobId, 'origin');
    expect(repo.runs).toHaveLength(1);
    expect(repo.runs[0]).toMatchObject({ status: 'RUNNING', phase: 'RETRYING' });
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body><h1>Title</h1></body>',
    }));
    await retry();
    await execute.executeScrape(jobId, 'origin');
    expect(repo.runs).toHaveLength(1);
    expect(repo.runs[0]?.status).toBe('SUCCESS');
    expect(compiler.calls).toHaveLength(0);
    expect(
      (await repo.usageRepository!.getUsage((await repo.findById(jobId))!.userId)).executionsCount
    ).toBe(1);
  });
  it('confirms once after the floor, then terminates without recompiling uncertain content', async () => {
    await repo.updateJob(jobId, { extractionPlan: fixturePlan({ readySelector: '#target' }) });
    await execute.executeScrape(jobId, 'origin');
    expect(repo.runs[0]?.phase).toBe('CONFIRMING');
    expect(repo.runs[0]!.nextAttemptAt!.getTime() - Date.now()).toBeGreaterThanOrEqual(899900);
    await execute.executeScrape(jobId, 'early', repo.runs[0]!.id);
    expect(repo.runs[0]!.metadata!.accessAttempts).toBe(1);
    await retry();
    expect(repo.runs[0]?.status).toBe('FAILED');
    expect(scheduler.compilationQueue).toHaveLength(0);
    expect((await repo.findById(jobId))?.status).toBe('ACTIVE');
  });
  it.each([
    new AntiBotBlockedError('blocked'),
    new UpstreamHttpError(401),
    new UpstreamHttpError(404),
    new UpstreamHttpError(410),
    new UnsupportedCapabilityError('unsupported'),
  ])('never compiles access or capability failures: %s', async (error) => {
    scraper.setHandler(async () => {
      throw error;
    });
    await execute.executeScrape(jobId);
    expect(repo.runs[0]?.status).toBe('FAILED');
    expect(scheduler.compilationQueue).toHaveLength(0);
  });
  it('finishes the original run after recovery and ignores duplicate compiler delivery', async () => {
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body>layout changed</body>',
    }));
    await execute.executeScrape(jobId, 'origin');
    const run = repo.runs[0]!;
    expect(run.phase).toBe('RECOVERING');
    compiler.setHandler(async () => fixturePlan());
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body><h1>Title</h1></body>',
    }));
    await compile.compileJob(jobId, 'recovery', false, run.id);
    await compile.compileJob(jobId, 'recovery', false, run.id);
    expect(repo.runs).toHaveLength(1);
    expect(run).toMatchObject({ status: 'SUCCESS', recoveredAutomatically: true });
    expect(compiler.calls).toHaveLength(1);
    expect(
      (await repo.usageRepository!.getUsage((await repo.findById(jobId))!.userId)).compilationsCount
    ).toBe(1);
  });
  it('requires recovery compilation to belong to an active execution run', async () => {
    await expect(compile.compileJob(jobId, 'recovery', false)).rejects.toThrow(
      'must be attached to an execution run'
    );
    expect(compiler.calls).toHaveLength(0);
  });
  it('terminates the final transient compiler attempt instead of remaining in recovery', async () => {
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body>layout changed</body>',
    }));
    await execute.executeScrape(jobId);
    compiler.setHandler(async () => {
      throw new CompilerApiRequestError(503);
    });
    const run = repo.runs[0]!;
    for (let i = 0; i < env.COMPILATION_QUEUE_MAX_ATTEMPTS; i++) {
      await expect(
        compile.compileJob(jobId, 'recovery', i + 1 < env.COMPILATION_QUEUE_MAX_ATTEMPTS, run.id)
      ).rejects.toThrow();
    }
    expect(repo.runs).toHaveLength(1);
    expect(run.status).toBe('FAILED');
    expect((await repo.findById(jobId))?.status).toBe('FAILED');
  });
  it('exhausts transient access retries and permits a fresh scheduled execution', async () => {
    scraper.setHandler(async () => {
      throw new NavigationTimeoutError('timeout');
    });
    await execute.executeScrape(jobId, 'first-origin');
    for (let i = 1; i < env.SCRAPE_MAX_ATTEMPTS; i++) await retry();
    expect(repo.runs).toHaveLength(1);
    expect(repo.runs[0]?.status).toBe('FAILED');
    expect(repo.runs[0]?.errorMessage).toContain('took too long to respond');
    expect((await repo.findById(jobId))?.status).toBe('ACTIVE');
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body><h1>Title</h1></body>',
    }));
    await execute.executeScrape(jobId, 'next-cron');
    expect(repo.runs).toHaveLength(2);
    expect(repo.runs[1]?.status).toBe('SUCCESS');
  });
  it('does not send a change alert when recovery restores the same content', async () => {
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body><h1>Title</h1></body>',
    }));
    await repo.updateJob(jobId, { contractRevision: 'intent-1' });
    await execute.executeScrape(jobId, 'baseline');
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body>broken</body>',
    }));
    await execute.executeScrape(jobId, 'recover');
    compiler.setHandler(async () => fixturePlan());
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body><h1>Title</h1></body>',
    }));
    await compile.compileJob(jobId, 'recovery', false, repo.runs[1]!.id);
    expect(repo.runs[1]).toMatchObject({
      status: 'SUCCESS',
      recoveredAutomatically: true,
      hasChanges: 'NO',
    });
    expect(repo.pendingDeliveries).toHaveLength(0);
  });
  it('rejects recovery that changes the monitored intent', async () => {
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body>broken</body>',
    }));
    await execute.executeScrape(jobId);
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body><h1>Title</h1></body>',
    }));
    compiler.setHandler(async () =>
      fixturePlan({
        fields: { other: { type: 'string', sources: [{ kind: 'dom', selector: 'h1' }] } },
      })
    );
    await expect(compile.compileJob(jobId, 'recovery', false, repo.runs[0]!.id)).rejects.toThrow(
      'intent'
    );
    expect(repo.runs[0]?.status).toBe('FAILED');
    expect(repo.pendingDeliveries).toHaveLength(0);
    expect((await repo.findById(jobId))?.extractionPlan?.intent.fields.title).toBeDefined();
  });
  it('accepts a validated empty collection without recovery', async () => {
    await repo.updateJob(jobId, {
      extractionPlan: fixturePlan({
        mode: 'collection',
        containerSelector: '.item',
        emptySelector: '.empty',
      }),
    });
    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 1,
      rawHtml: '<body><div class="empty">No items</div></body>',
    }));
    await execute.executeScrape(jobId);
    expect(repo.runs[0]).toMatchObject({
      status: 'SUCCESS',
      extractionReport: { quality: 'EMPTY' },
    });
    expect(scheduler.compilationQueue).toHaveLength(0);
  });
  it.each(['pause', 'edit', 'delete'] as const)(
    'discards late results after %s',
    async (action) => {
      let release!: () => void;
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      scraper.setHandler(async (url) => {
        started();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { url, httpStatus: 200, durationMs: 1, rawHtml: '<body><h1>Title</h1></body>' };
      });
      const pending = execute.executeScrape(jobId);
      await ready;
      if (action === 'delete') await repo.deleteJob(jobId);
      else
        await repo.updateJob(
          jobId,
          action === 'pause' ? { status: 'PAUSED' } : { userPrompt: 'New instructions' }
        );
      release();
      await pending;
      expect(repo.runs.some((run) => run.status === 'SUCCESS')).toBe(false);
      expect(repo.pendingDeliveries).toHaveLength(0);
      if (action !== 'delete') expect(repo.runs[0]?.status).toBe('CANCELLED');
    }
  );
});
