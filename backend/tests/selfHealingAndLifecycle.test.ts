import { beforeEach, describe, expect, it } from 'vitest';
import {
  AntiBotBlockedError,
  CompilerValidationError,
  NavigationTimeoutError,
} from '../src/errors/domainErrors.js';
import { CompilationService } from '../src/services/compilationService.js';
import { ScrapeExecutionService } from '../src/services/scrapeExecutionService.js';
import {
  InMemoryJobRepository,
  MockCompilerProvider,
  MockJobScheduler,
  MockNotificationProvider,
  MockScraperEngine,
} from './helpers/testDoubles.js';

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
      scraperEngine: scraper,
      compilerProvider: compiler,
      notificationProvider: notifier,
      jobScheduler: scheduler,
    });

    scrapeService = new ScrapeExecutionService({
      jobRepository: repository,
      scraperEngine: scraper,
      notificationProvider: notifier,
      jobScheduler: scheduler,
      consecutiveFailuresForHealing: 2,
      maxHealingRetries: 3,
    });
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
    expect(compiledJob.extractorConfig).toBeDefined();
    expect(scheduler.scheduledRepeatables.has(job.id)).toBe(true);

    const runs = await repository.findRunsByJobId(job.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.hasChanges).toBe('INITIAL');
    expect(runs[0]?.status).toBe('SUCCESS');
  });

  it('transitions job to FAILED if compiled selectors fail the pre-activation smoke-test', async () => {
    compiler.setHandler(async () => ({
      fields: {
        title: { selector: '#non-existent-selector', attribute: 'text' },
      },
    }));

    const job = await repository.createJob({
      url: 'https://store.example.com/broken',
      userPrompt: 'Monitor title',
      notificationEmail: 'dev@example.com',
      cronExpression: '0 */6 * * *',
    });

    await expect(compilationService.compileJob(job.id)).rejects.toThrow(CompilerValidationError);

    const updated = await repository.findById(job.id);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.lastError).toContain('Smoke test');
    expect(scheduler.scheduledRepeatables.has(job.id)).toBe(false);
  });

  it('dispatches notification email only when extracted data genuinely changes', async () => {
    const job = await repository.createJob({
      url: 'https://store.example.com/item',
      userPrompt: 'Monitor price',
      notificationEmail: 'alerts@example.com',
      cronExpression: '*/30 * * * *',
    });

    await compilationService.compileJob(job.id);
    expect(notifier.sentAlerts).toHaveLength(0);

    // Run 1: Same content (with volatile relative timestamp that must be ignored)
    scraper.setHandler(async (url) => ({
      rawHtml: `<html><body><h1 data-testid="product-title">Notebook Pro</h1><span data-testid="product-price">$ 1,200.00 posted 5 minutes ago</span></body></html>`,
      httpStatus: 200,
      url,
      durationMs: 25,
    }));

    const runUnchanged = await scrapeService.executeScrape(job.id);
    expect(runUnchanged?.hasChanges).toBe('NO');
    expect(notifier.sentAlerts).toHaveLength(0);

    // Run 2: Price drops -> must detect change and send alert
    scraper.setHandler(async (url) => ({
      rawHtml: `<html><body><h1 data-testid="product-title">Notebook Pro</h1><span data-testid="product-price">$ 999.00</span></body></html>`,
      httpStatus: 200,
      url,
      durationMs: 28,
    }));

    const runChanged = await scrapeService.executeScrape(job.id);
    expect(runChanged?.hasChanges).toBe('YES');
    expect(notifier.sentAlerts).toHaveLength(1);
    expect(notifier.sentAlerts[0]?.to).toBe('alerts@example.com');
    expect(notifier.sentAlerts[0]?.diffSummary.modified[0]?.field).toBe('price');
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

    // 3rd failure -> still within maxHealingRetries (3), enqueues healing
    await scrapeService.executeScrape(job.id);
    currentJob = await repository.findById(job.id);
    expect(currentJob?.status).toBe('HEALING');
    expect(currentJob?.failureCount).toBe(3);

    // 4th failure -> exceeds maxHealingRetries (3) -> transitions to FAILED to prevent infinite loop!
    const queueCountBefore = scheduler.compilationQueue.length;
    await scrapeService.executeScrape(job.id);
    currentJob = await repository.findById(job.id);
    expect(currentJob?.status).toBe('FAILED');
    expect(currentJob?.failureCount).toBe(4);
    expect(scheduler.compilationQueue.length).toBe(queueCountBefore);
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
});
