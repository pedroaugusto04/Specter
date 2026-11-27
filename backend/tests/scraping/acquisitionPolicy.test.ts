import { InMemoryAccessCooldownStore } from '../helpers/cooldownFixtures.js';
import { PlanExecutionService } from '../../src/services/planExecutionService.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CoordinatedExecutor,
  type DocumentCandidate,
} from '../../src/acquisition/coordinatedExecutor.js';
import { AccessCooldownService } from '../../src/acquisition/cooldown.js';
import { AcquisitionFailureError, classifyAccessFailure } from '../../src/acquisition/failure.js';
import { AntiBotBlockedError, NavigationTimeoutError } from '../../src/errors/domainErrors.js';
import { PageExtractor } from '../../src/extraction/pageExtractor.js';
import { standardSourceReaders } from '../../src/extraction/sources.js';
import { fixturePlan, fixturePolicy } from '../helpers/extractionFixtures.js';
import {
  createTestScrapeExecutionService,
  InMemoryJobRepository,
  InMemorySessionRepository,
  MockJobScheduler,
  MockNotificationProvider,
} from '../helpers/testDoubles.js';
import { NoopStorageProvider } from '../../src/providers/storage/noopStorage.provider.js';
import { presentExtractionReport, formatUserErrorMessage } from '../../src/utils/errorSanitizer.js';
import type { DocumentAdapter, ExtractionPlan } from '../../src/extraction/contracts.js';
import { DiscoveryDocumentAdapter } from '../../src/extraction/adapters/discoveryDocument.adapter.js';
import { createExecutionContext } from '../../src/extraction/context.js';

function candidate(
  name: string,
  external: boolean,
  value: string | Error,
  transport: 'http' | 'browser' = 'http'
): DocumentCandidate {
  const adapter: DocumentAdapter = {
    open: vi.fn(async () => {
      if (value instanceof Error) throw value;
      return {
        snapshot: async () => ({
          html: value,
          url: 'https://example.com',
          httpStatus: 200,
          responses: [],
        }),
        check: async () => undefined,
        advance: async () => {},
        discover: async () => {
          throw new Error('Unsupported');
        },
        screenshot: async () => undefined,
        close: vi.fn(async () => {}),
      };
    }),
  };
  return { name, external, transport, adapter };
}
const executor = (candidates: DocumentCandidate[]) =>
  new CoordinatedExecutor(candidates, new PageExtractor(standardSourceReaders()), fixturePolicy);
afterEach(() => vi.useRealTimers());
describe('Shared acquisition policy', () => {
  it('accepts local data without external calls', async () => {
    const remote = candidate('remote', true, '<h1>remote</h1>');
    const result = await executor([
      candidate('local', false, '<body><h1>local</h1></body>'),
      remote,
    ]).execute('https://example.com', fixturePlan());
    expect(result.data).toEqual({ title: 'local' });
    expect(remote.adapter.open).not.toHaveBeenCalled();
  });
  it('validates every provider candidate before accepting a recovery', async () => {
    const result = await executor([
      candidate('local', false, new AntiBotBlockedError('blocked')),
      candidate('bad', true, '<body>no title</body>'),
      candidate('good', true, '<body><h1>valid</h1></body>'),
    ]).execute('https://example.com', fixturePlan());
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toEqual({ title: 'valid' });
    expect(
      result.report.trace
        ?.filter((item) => item.stage.startsWith('acquisition:'))
        .map((item) => item.code)
    ).toEqual(['BLOCKED', 'REJECTED', 'ACCEPTED']);
  });
  it('falls back to remote unblockers when browser fails with ERR_TUNNEL_CONNECTION_FAILED', async () => {
    const tunnelError = new Error(
      'page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://example.com'
    );
    expect(classifyAccessFailure(tunnelError)).toBe('TRANSIENT');
    const result = await executor([
      candidate('browser', false, tunnelError, 'browser'),
      candidate('good', true, '<body><h1>recovered</h1></body>'),
    ]).execute('https://example.com', fixturePlan());
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toEqual({ title: 'recovered' });
  });
  it('does not pay for local selector failures', async () => {
    const remote = candidate('remote', true, '<h1>remote</h1>');
    const result = await executor([
      candidate('local', false, '<body>no title</body>'),
      remote,
    ]).execute('https://example.com', fixturePlan());
    expect(result.report.quality).toBe('INVALID');
    expect(remote.adapter.open).not.toHaveBeenCalled();
  });
  it('rejects passive fallback for browser requirements without changing the plan', async () => {
    const plan: ExtractionPlan = fixturePlan();
    plan.strategy.transport = 'browser';
    plan.strategy.setup = [{ kind: 'click', locator: { kind: 'css', selector: 'button' } }];
    const passive = candidate('passive', true, '<h1>remote</h1>');
    await expect(
      executor([
        candidate('browser', false, new AntiBotBlockedError('blocked'), 'browser'),
        passive,
      ]).execute('https://example.com', plan)
    ).rejects.toMatchObject({ category: 'BLOCKED' });
    expect(passive.adapter.open).not.toHaveBeenCalled();
    expect(plan.strategy.transport).toBe('browser');
  });
  it('falls back from proxied browser to direct browser on proxy failure in discovery', async () => {
    const proxiedBrowser = candidate(
      'browser-proxied',
      false,
      new Error('page.goto: net::ERR_TUNNEL_CONNECTION_FAILED'),
      'browser'
    );
    const directBrowser = candidate(
      'browser-direct',
      false,
      '<h1>rendered by direct browser</h1>',
      'browser'
    );
    const passive = candidate('passive', true, '<h1>passive</h1>', 'http');

    const session = await new DiscoveryDocumentAdapter(
      [
        { name: 'browser-proxied', adapter: proxiedBrowser.adapter },
        { name: 'browser-direct', adapter: directBrowser.adapter },
      ],
      [passive]
    ).open('https://example.com', fixturePlan(), createExecutionContext(1000), {});

    const snapshot = await session.snapshot();
    expect(snapshot.html).toBe('<h1>rendered by direct browser</h1>');
    expect(proxiedBrowser.adapter.open).toHaveBeenCalledTimes(1);
    expect(directBrowser.adapter.open).toHaveBeenCalledTimes(1);
    expect(passive.adapter.open).not.toHaveBeenCalled();
  });
  it('shares compatibility policy with discovery', async () => {
    const browser = candidate('browser', false, new AntiBotBlockedError('blocked'), 'browser');
    const passive = candidate('passive', true, '<h1>remote</h1>');
    const plan = fixturePlan();
    plan.strategy.setup = [{ kind: 'scroll' }];
    await expect(
      new DiscoveryDocumentAdapter(browser.adapter, [passive]).open(
        'https://example.com',
        plan,
        createExecutionContext(1000),
        {}
      )
    ).rejects.toMatchObject({ category: 'BLOCKED' });
    expect(passive.adapter.open).not.toHaveBeenCalled();
  });
  it('does not forward authenticated sessions to external adapters', async () => {
    const remote = candidate('remote', true, '<body><h1>valid</h1></body>');
    await executor([candidate('local', false, new AntiBotBlockedError('blocked')), remote]).execute(
      'https://example.com',
      fixturePlan(),
      { storageState: { cookies: [{ value: 'private-session' }] } }
    );
    expect(vi.mocked(remote.adapter.open).mock.calls[0]?.[3].storageState).toBeUndefined();
  });
  it('shares the total deadline across alternatives', async () => {
    const local = candidate('local', false, new NavigationTimeoutError('timeout'));
    vi.mocked(local.adapter.open).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      throw new NavigationTimeoutError('timeout');
    });
    const remote = candidate('remote', true, '<h1>remote</h1>');
    await expect(
      executor([local, remote]).execute('https://example.com', fixturePlan(), { timeoutMs: 10 })
    ).rejects.toMatchObject({ category: 'TIMEOUT' });
    expect(remote.adapter.open).not.toHaveBeenCalled();
  });
  it('does not acquire documents for an already cancelled collection', async () => {
    const local = candidate('local', false, '<h1>local</h1>');
    await expect(
      executor([local]).execute('https://example.com', fixturePlan(), {
        signal: AbortSignal.abort(),
      })
    ).rejects.toMatchObject({ category: 'TIMEOUT' });
    expect(local.adapter.open).not.toHaveBeenCalled();
  });
  it('limits alternatives and preserves block classification across provider failures', async () => {
    const sixth = candidate('sixth', true, '<h1>remote</h1>');
    await expect(
      executor([
        candidate('local', false, new AntiBotBlockedError('blocked')),
        candidate('one', true, new Error('quota')),
        candidate('two', true, new Error('quota')),
        candidate('three', true, new Error('quota')),
        candidate('four', true, new Error('quota')),
        sixth,
      ]).execute('https://example.com', fixturePlan())
    ).rejects.toMatchObject({ category: 'BLOCKED', isRetryable: false });
    expect(sixth.adapter.open).not.toHaveBeenCalled();
    expect(classifyAccessFailure(new NavigationTimeoutError('timeout'))).toBe('TIMEOUT');
  });
});

describe('Per-monitor access cooldown', () => {
  async function setup() {
    const repository = new InMemoryJobRepository();
    const job = await repository.createJob({
      url: 'https://example.com',
      userPrompt: 'title',
      cronExpression: '0 */6 * * *',
    });
    const active = (await repository.updateJob(job.id, {
      status: 'ACTIVE',
      extractionPlan: fixturePlan(),
      planRevision: 'v1',
    }))!;
    const cooldown = new AccessCooldownService(
      new InMemoryAccessCooldownStore(),
      new InMemorySessionRepository(),
      2,
      3600000
    );
    return { repository, job: active, cooldown };
  }
  it('opens after two blocked executions, survives long cron gaps, expires and isolates revisions', async () => {
    vi.useFakeTimers();
    const { job, cooldown } = await setup();
    await cooldown.record(job, true);
    expect(await cooldown.state(job)).toBeNull();
    vi.advanceTimersByTime(6 * 3600000);
    await cooldown.record(job, true);
    expect(await cooldown.state(job)).toMatchObject({ reason: 'BLOCKED' });
    expect(await cooldown.state({ ...job, id: 'another' })).toBeNull();
    expect(await cooldown.state({ ...job, planRevision: 'v2' })).toBeNull();
    vi.advanceTimersByTime(3600001);
    expect(await cooldown.state(job)).toBeNull();
  });
  it('skips expensive calls, preserves lifecycle and never sends alerts on blocked runs', async () => {
    const { repository, job, cooldown } = await setup();
    const execute = vi.fn(async () => {
      throw new AcquisitionFailureError('BLOCKED', new Error('secret'));
    });
    const notifications = new MockNotificationProvider();
    const scheduler = new MockJobScheduler();
    const service = createTestScrapeExecutionService({
      jobRepository: repository,
      planExecutor: { execute },
      accessCooldown: cooldown,
      alertRouter: notifications,
      jobScheduler: scheduler,
      storageProvider: new NoopStorageProvider(),
    });
    await service.executeScrape(job.id);
    await service.executeScrape(job.id);
    await service.executeScrape(job.id);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(await repository.findById(job.id)).toMatchObject({ status: 'ACTIVE' });
    expect(await repository.findLatestSuccessfulRun(job.id)).toBeNull();
    expect(scheduler.compilationQueue).toHaveLength(0);
  });
  it('preserves a valid baseline and prepares no alert after all provider results are invalid', async () => {
    const { repository, job } = await setup();
    const local = candidate('local', false, '<body><h1>baseline</h1></body>');
    const remote = candidate('remote', true, '<body>missing data</body>');
    const notifications = new MockNotificationProvider();
    const prepare = vi.spyOn(notifications, 'prepare');
    const service = createTestScrapeExecutionService({
      jobRepository: repository,
      planExecutor: new PlanExecutionService(executor([local, remote])),
      alertRouter: notifications,
      jobScheduler: new MockJobScheduler(),
      storageProvider: new NoopStorageProvider(),
    });
    const baseline = await service.executeScrape(job.id);
    expect(baseline?.status).toBe('SUCCESS');
    vi.mocked(local.adapter.open).mockRejectedValueOnce(new AntiBotBlockedError('blocked'));
    await service.executeScrape(job.id);
    expect((await repository.findLatestSuccessfulRun(job.id))?.id).toBe(baseline?.id);
    expect(repository.pendingDeliveries).toEqual([]);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('clears the consecutive-block sequence after a nonblocked result', async () => {
    const { job, cooldown } = await setup();
    await cooldown.record(job, true);
    await cooldown.record(job, false);
    await cooldown.record(job, true);
    expect(await cooldown.state(job)).toBeNull();
  });
  it('distinguishes locator timeouts from real navigation access timeouts', () => {
    const locatorTimeout = new Error(
      "locator.waitFor: Timeout 120000ms exceeded.\nCall log:\n  - waiting for locator('div.release-entry').first()"
    );
    locatorTimeout.name = 'TimeoutError';
    expect(classifyAccessFailure(locatorTimeout)).toBeUndefined();

    const roleTimeout = new Error("waiting for getByRole('button')");
    roleTimeout.name = 'TimeoutError';
    expect(classifyAccessFailure(roleTimeout)).toBeUndefined();

    const navTimeout = new NavigationTimeoutError('Browser navigation exceeded its budget.');
    expect(classifyAccessFailure(navTimeout)).toBe('TIMEOUT');
  });
});

it('presents safe diagnostics for current and historical errors', () => {
  expect(formatUserErrorMessage(new Error('https://provider/?apikey=secret'))).not.toContain(
    'secret'
  );
  const report = presentExtractionReport({
    quality: 'PARTIAL',
    scope: 'page',
    pagesVisited: 1,
    sourcesUsed: {},
    issues: ['parser https://provider/?apikey=secret'],
  });
  expect(JSON.stringify(report)).not.toContain('secret');
});
