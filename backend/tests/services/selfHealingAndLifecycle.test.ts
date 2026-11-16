import { ExtractionQuality, FailureCode } from '../../src/extraction/constants.js';
import { InMemoryRealtimeEventBus } from '../../src/providers/realtime/inMemoryRealtime.provider.js';
import { RealtimeService } from '../../src/services/realtimeService.js';
import type { RealtimeEvent } from '../../src/providers/realtime/realtime.interface.js';
import { NoopStorageProvider } from '../../src/providers/storage/noopStorage.provider.js';
import { fixtureExecutor, fixtureConfiguration } from '../helpers/extractionFixtures.js';
import { fixturePlan } from '../helpers/extractionFixtures.js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AntiBotBlockedError,
  CompilerApiRequestError,
  CompilerValidationError,
  NavigationTimeoutError,
} from '../../src/errors/domainErrors.js';
import { CompilationService } from '../../src/services/compilationService.js';
import { ScrapeExecutionService } from '../../src/services/scrapeExecutionService.js';
import { CompilationReason } from '../../src/queues/scheduler.interface.js';
import { JobService } from '../../src/services/jobService.js';
import { JobPresenter } from '../../src/presentation/jobPresenter.js';
import {
  InMemoryJobRepository,
  MockCompilerProvider,
  MockJobScheduler,
  MockNotificationProvider,
  MockScraperEngine,
} from '../helpers/testDoubles.js';
describe('Job Compilation, Diff Notifications & Self-Healing State Machine', () => {
  let repository: InMemoryJobRepository;
  let scraper: MockScraperEngine;
  let compiler: MockCompilerProvider;
  let notifier: MockNotificationProvider;
  let scheduler: MockJobScheduler;
  let compilationService: CompilationService;
  let scrapeService: ScrapeExecutionService;
  beforeEach(() => {
    repository = new InMemoryJobRepository();
    scraper = new MockScraperEngine();
    compiler = new MockCompilerProvider();
    notifier = new MockNotificationProvider();
    scheduler = new MockJobScheduler();
    compilationService = new CompilationService({
      jobRepository: repository,
      configurationPipeline: fixtureConfiguration(compiler, scraper),
      alertRouter: notifier,
      storageProvider: new NoopStorageProvider(),
      jobScheduler: scheduler,
    });
    scrapeService = new ScrapeExecutionService({
      jobRepository: repository,
      planExecutor: fixtureExecutor(scraper),
      alertRouter: notifier,
      storageProvider: new NoopStorageProvider(),
      jobScheduler: scheduler,
      consecutiveFailuresForHealing: 2,
      maxHealingRetries: 3,
    });
  });
  it('notifies subscribers after an inconclusive run updates the error and failure counter', async () => {
    const bus = new InMemoryRealtimeEventBus();
    const realtimeService = new RealtimeService(bus);
    const job = await repository.createJob({
      url: 'https://store.example.com/item',
      userPrompt: 'Monitor title',
      cronExpression: '0 */6 * * *',
    });
    await compilationService.compileJob(job.id);
    const events: RealtimeEvent[] = [];
    await bus.subscribe(job.userId, (event) => events.push(event));
    const executor = fixtureExecutor(scraper);
    const service = new ScrapeExecutionService({
      jobRepository: repository,
      planExecutor: {
        execute: async (...args) => {
          const result = await executor.execute(...args);
          return {
            ...result,
            report: {
              ...result.report,
              quality: ExtractionQuality.Inconclusive,
              failureCode: FailureCode.NoProgress,
              issues: ['Extraction could not be validated.'],
            },
          };
        },
      },
      alertRouter: notifier,
      storageProvider: new NoopStorageProvider(),
      jobScheduler: scheduler,
      realtimeService,
      consecutiveFailuresForHealing: 2,
      maxHealingRetries: 3,
    });
    await service.executeScrape(job.id);
    expect((await repository.findById(job.id))?.failureCount).toBe(1);
    expect(events.at(-1)).toMatchObject({ type: 'JOB_UPDATED', jobId: job.id });
    expect(events.at(-1)?.status).not.toBe('RUNNING');
    expect((await repository.findRunsByJobId(job.id)).some((run) => run.status === 'FAILED')).toBe(
      true
    );
    await realtimeService.close();
  });
  it('transitions job from PENDING_COMPILATION to ACTIVE after sanitizing DOM, compiling, and passing smoke-test', async () => {
    scraper.setHandler(async (url) => ({
      rawHtml: `
        <html>
          <head><script>alert("xss")</script></head>
          <body>
            <h1 data-testid="product-title">MacBook Air M3</h1>
            <span data-testid="product-price">$ 1,099.00</span>
          </body>
        </html>
      `,
      httpStatus: 200,
      url,
      durationMs: 35,
    }));
    const job = await repository.createJob({
      url: 'https://store.example.com/macbook',
      userPrompt: 'Monitor MacBook title and price',
      notificationEmail: 'dev@example.com',
      cronExpression: '0 */6 * * *',
    });
    expect(job.status).toBe('PENDING_COMPILATION');
    const compiledJob = await compilationService.compileJob(job.id);
    // Ensure compiler received sanitized HTML (no <script>)
    expect(compiler.calls).toHaveLength(1);
    expect(compiler.calls[0]?.sanitizedHtml).not.toContain('<script>');
    expect(compiledJob.status).toBe('ACTIVE');
    expect(compiledJob.failureCount).toBe(0);
    expect(compiledJob.extractionPlan).toBeDefined();
    expect(scheduler.scheduledRepeatables.has(job.id)).toBe(true);
    const runs = await repository.findRunsByJobId(job.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.hasChanges).toBe('INITIAL');
    expect(runs[0]?.status).toBe('SUCCESS');
  });
  it('transitions job to FAILED if compiled selectors fail the pre-activation smoke-test', async () => {
    compiler.setHandler(async () =>
      fixturePlan({
        mode: 'single',
        readySelector: 'body',
        scope: 'page',
        identityFields: [],
        triggerRules: [],
        triggerMatchMode: 'all',
        fields: {
          title: {
            sources: [{ kind: 'dom', selector: '#non-existent-selector', attribute: 'text' }],
            type: 'string',
            required: true,
            locale: 'en-US',
          },
        },
      })
    );
    const job = await repository.createJob({
      url: 'https://store.example.com/broken',
      userPrompt: 'Monitor title',
      notificationEmail: 'dev@example.com',
      cronExpression: '0 */6 * * *',
    });
    await expect(compilationService.compileJob(job.id)).rejects.toThrow(CompilerValidationError);
    const updated = await repository.findById(job.id);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.lastError).toBe(
      'The requested information could not be verified on the page. Check the instructions and try again.'
    );
    expect(scheduler.scheduledRepeatables.has(job.id)).toBe(false);
  });
  it('keeps a rate-limited recompilation pending until retries are exhausted', async () => {
    const job = await repository.createJob({
      url: 'https://store.example.com/item',
      userPrompt: 'Monitor price',
      notificationEmail: 'alerts@example.com',
      cronExpression: '*/30 * * * *',
    });
    await compilationService.compileJob(job.id);
    await repository.updateJob(job.id, { status: 'PENDING_COMPILATION' });
    compiler.setHandler(async () => {
      throw new CompilerApiRequestError(429);
    });
    await expect(
      compilationService.compileJob(job.id, CompilationReason.Manual, true)
    ).rejects.toThrow(CompilerApiRequestError);
    expect((await repository.findById(job.id))?.status).toBe('PENDING_COMPILATION');
    await expect(
      compilationService.compileJob(job.id, CompilationReason.Manual, false)
    ).rejects.toThrow(CompilerApiRequestError);
    expect((await repository.findById(job.id))?.status).toBe('ACTIVE');
  });
  it('dispatches notification email only when extracted data genuinely changes', async () => {
    const job = await repository.createJob({
      url: 'https://store.example.com/item',
      userPrompt: 'Monitor price',
      notificationEmail: 'alerts@example.com',
      cronExpression: '*/30 * * * *',
    });
    await compilationService.compileJob(job.id);
    expect(repository.pendingDeliveries.map((delivery) => delivery.payload)).toHaveLength(0);
    // Run 1: Same extracted content.
    scraper.setHandler(async (url) => ({
      rawHtml: `<html><body><h1 data-testid="product-title">Notebook Pro</h1><span data-testid="product-price">$ 1,200.00</span></body></html>`,
      httpStatus: 200,
      url,
      durationMs: 25,
    }));
    const runUnchanged = await scrapeService.executeScrape(job.id);
    expect(runUnchanged?.hasChanges).toBe('NO');
    expect(repository.pendingDeliveries.map((delivery) => delivery.payload)).toHaveLength(0);
    // Run 2: Price drops -> must detect change and send alert
    scraper.setHandler(async (url) => ({
      rawHtml: `<html><body><h1 data-testid="product-title">Notebook Pro</h1><span data-testid="product-price">$ 999.00</span></body></html>`,
      httpStatus: 200,
      url,
      durationMs: 28,
    }));
    const runChanged = await scrapeService.executeScrape(job.id);
    expect(runChanged?.hasChanges).toBe('YES');
    expect(repository.pendingDeliveries.map((delivery) => delivery.payload)).toHaveLength(1);
    expect(repository.pendingDeliveries.map((delivery) => delivery.payload)[0]?.to).toBe(
      'alerts@example.com'
    );
    expect(
      repository.pendingDeliveries.map((delivery) => delivery.payload)[0]?.diffSummary.modified[0]
        ?.field
    ).toBe('price');
  });
  it('transitions to HEALING only after 2 consecutive SelectorMismatchErrors, and caps retries at maxHealingRetries', async () => {
    const job = await repository.createJob({
      url: 'https://store.example.com/item',
      userPrompt: 'Monitor product',
      notificationEmail: 'alerts@example.com',
      cronExpression: '*/30 * * * *',
    });
    await compilationService.compileJob(job.id);
    // Website changes layout (HTTP 200 OK, but selectors return empty)
    scraper.setHandler(async (url) => ({
      rawHtml: `<html><body><div class="new-v2-title">Notebook Pro</div><div class="new-v2-price">$ 1,100.00</div></body></html>`,
      httpStatus: 200,
      url,
      durationMs: 30,
    }));
    // 1st consecutive failure -> remains ACTIVE, failureCount = 1, no healing compilation yet
    await scrapeService.executeScrape(job.id);
    let currentJob = await repository.findById(job.id);
    expect(currentJob?.status).toBe('ACTIVE');
    expect(currentJob?.failureCount).toBe(1);
    expect(scheduler.compilationQueue).toHaveLength(0);
    // 2nd consecutive failure -> transitions to HEALING, failureCount = 2, enqueues healing compilation
    await scrapeService.executeScrape(job.id);
    currentJob = await repository.findById(job.id);
    expect(currentJob?.status).toBe('HEALING');
    expect(currentJob?.failureCount).toBe(2);
    expect(scheduler.compilationQueue).toHaveLength(1);
    expect(scheduler.compilationQueue[0]).toEqual({ jobId: job.id, reason: 'healing' });
    // Scheduled scraping must not run during recovery.
    await scrapeService.executeScrape(job.id);
    expect((await repository.findById(job.id))?.failureCount).toBe(2);
    // A new cycle after the window budget is exhausted must stop scheduling.
    await repository.updateJob(job.id, {
      status: 'ACTIVE',
      failureCount: 1,
      healingAttempts: 3,
      healingWindowStartedAt: new Date(),
    });
    const queued = scheduler.compilationQueue.length;
    await scrapeService.executeScrape(job.id);
    expect((await repository.findById(job.id))?.status).toBe('FAILED');
    expect(scheduler.compilationQueue.length).toBe(queued);
  });
  it('does NOT trigger self-healing on AntiBotBlockedError (HTTP 403/429) or NavigationTimeoutError', async () => {
    const job = await repository.createJob({
      url: 'https://protected.example.com/item',
      userPrompt: 'Monitor item',
      notificationEmail: 'alerts@example.com',
      cronExpression: '*/30 * * * *',
    });
    await compilationService.compileJob(job.id);
    // Simulate HTTP 403 Cloudflare block twice in a row
    scraper.setHandler(async () => {
      throw new AntiBotBlockedError('Cloudflare 403 Forbidden', 403);
    });
    await scrapeService.executeScrape(job.id);
    await scrapeService.executeScrape(job.id);
    let currentJob = await repository.findById(job.id);
    expect(currentJob?.status).toBe('ACTIVE');
    expect(currentJob?.failureCount).toBe(0);
    expect(scheduler.compilationQueue).toHaveLength(0);
    // Simulate NavigationTimeoutError -> should rethrow for BullMQ backoff without triggering healing
    scraper.setHandler(async () => {
      throw new NavigationTimeoutError('Navigation timeout after 30000ms');
    });
    await expect(scrapeService.executeScrape(job.id)).rejects.toThrow(NavigationTimeoutError);
    currentJob = await repository.findById(job.id);
    expect(currentJob?.status).toBe('ACTIVE');
    expect(currentJob?.failureCount).toBe(0);
    expect(scheduler.compilationQueue).toHaveLength(0);
  });

  it('instantly cancels an active compilation when requested via jobService.cancelCompilation', async () => {
    const jobService = new JobService({
      jobRepository: repository,
      jobScheduler: scheduler,
      compilationControl: compilationService,
      scraperEngine: scraper,
      presenter: new JobPresenter(),
    });

    const job = await repository.createJob({
      url: 'https://example.com/item',
      userPrompt: 'Monitor price',
      notificationEmail: 'alerts@example.com',
      cronExpression: '*/30 * * * *',
    });

    let compilationStarted = false;
    compiler.setHandler(async (input) => {
      compilationStarted = true;
      await new Promise<void>((_, reject) => {
        if (input.signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        input.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return fixturePlan({
        mode: 'single',
        readySelector: 'body',
        scope: 'page',
        identityFields: [],
        triggerRules: [],
        triggerMatchMode: 'all',
        fields: {},
      });
    });

    const compilePromise = compilationService.compileJob(job.id);

    while (!compilationStarted) {
      await new Promise((r) => setTimeout(r, 10));
    }

    const resultDto = await jobService.cancelCompilation(job.id);
    await compilePromise;

    expect(resultDto.status).toBe('PAUSED');
    const updated = await repository.findById(job.id);
    expect(updated?.status).toBe('PAUSED');
    expect(scheduler.compilationQueue).toHaveLength(0);
    expect(repository.runs).toHaveLength(0);
  });

  it('cancels ongoing compilation and pauses the monitor when setJobPauseState(true) is invoked', async () => {
    const jobService = new JobService({
      jobRepository: repository,
      jobScheduler: scheduler,
      compilationControl: compilationService,
      scraperEngine: scraper,
      presenter: new JobPresenter(),
    });

    const job = await repository.createJob({
      url: 'https://example.com/item',
      userPrompt: 'Monitor price',
      notificationEmail: 'alerts@example.com',
      cronExpression: '*/30 * * * *',
    });

    let compilationStarted = false;
    compiler.setHandler(async (input) => {
      compilationStarted = true;
      await new Promise<void>((_, reject) => {
        if (input.signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        input.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return fixturePlan({
        mode: 'single',
        readySelector: 'body',
        scope: 'page',
        identityFields: [],
        triggerRules: [],
        triggerMatchMode: 'all',
        fields: {},
      });
    });

    const compilePromise = compilationService.compileJob(job.id);

    while (!compilationStarted) {
      await new Promise((r) => setTimeout(r, 10));
    }

    await jobService.setJobPauseState(job.id, true);
    await compilePromise;

    const updated = await repository.findById(job.id);
    expect(updated?.status).toBe('PAUSED');
    expect(scheduler.compilationQueue).toHaveLength(0);
    expect(repository.runs).toHaveLength(0);
  });

  it('does not start compilation when cancellation arrives while quota validation is pending', async () => {
    const job = await repository.createJob({
      userId: 'quota-race-user',
      url: 'https://example.com/item',
      userPrompt: 'Monitor price',
      notificationEmail: 'alerts@example.com',
      cronExpression: '*/30 * * * *',
    });

    let releaseQuotaCheck!: () => void;
    let quotaCheckStarted!: () => void;
    const quotaStarted = new Promise<void>((resolve) => {
      quotaCheckStarted = resolve;
    });
    const quotaService = {
      assertCanCompile: () => {
        quotaCheckStarted();
        return new Promise<void>((resolve) => {
          releaseQuotaCheck = resolve;
        });
      },
    } as unknown as import('../../src/services/quotaService.js').QuotaService;
    const quotaAwareCompilationService = new CompilationService({
      jobRepository: repository,
      configurationPipeline: fixtureConfiguration(compiler, scraper),
      alertRouter: notifier,
      storageProvider: new NoopStorageProvider(),
      jobScheduler: scheduler,
      quotaService,
    });
    const jobService = new JobService({
      jobRepository: repository,
      jobScheduler: scheduler,
      compilationControl: quotaAwareCompilationService,
    });

    const compilePromise = quotaAwareCompilationService.compileJob(job.id);
    await quotaStarted;
    await jobService.cancelCompilation(job.id);
    releaseQuotaCheck();
    await compilePromise;

    expect(compiler.calls).toHaveLength(0);
    expect((await repository.findById(job.id))?.status).toBe('PAUSED');
    expect(repository.runs).toHaveLength(0);
  });
});
