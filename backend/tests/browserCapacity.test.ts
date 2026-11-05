import { AccessScraperEngine } from '../src/providers/scraping/accessScraper.provider.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserCapacity } from '../src/resources/browserCapacity.js';
import { InMemoryLeaseStore } from './helpers/resourceFixtures.js';
import { BrowserDocumentAdapter } from '../src/extraction/adapters/browserDocument.adapter.js';
import { PlaywrightScraperEngine } from '../src/providers/scraping/playwrightScraper.provider.js';
import { createExecutionContext } from '../src/extraction/context.js';
import { BrowserCapacityError } from '../src/errors/domainErrors.js';
import { fixturePlan, fixturePolicy } from './helpers/extractionFixtures.js';

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch } }));
vi.mock('../src/utils/ssrfValidator.js', () => ({ assertSafeUrl: async (url: string) => url }));
function browserFixture() {
  const element = { first: () => element, evaluate: async () => '<html><body>Page</body></html>' };
  const page = {
    on: vi.fn(),
    goto: async () => ({ status: () => 200 }),
    setDefaultTimeout: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    locator: () => element,
    url: () => 'https://example.com',
  };
  const context = {
    route: vi.fn(),
    addInitScript: vi.fn(async () => {}),
    newPage: async () => page,
    close: vi.fn(async () => {}),
  };
  const browser = { newContext: async () => context, close: vi.fn(async () => {}) };
  return { browser, context };
}
beforeEach(() => launch.mockReset());
describe('Browser capacity at session ownership boundary', () => {
  it('shares capacity between extraction and API probes, releasing it once after closure', async () => {
    const store = new InMemoryLeaseStore();
    const capacity = new BrowserCapacity(store, 1, 10000);
    const first = browserFixture();
    launch.mockResolvedValue(first.browser);
    const worker = new BrowserDocumentAdapter(fixturePolicy, capacity);
    const external = { name: 'external', isEnabled: () => true, fetchHtml: vi.fn() };
    const probe = new AccessScraperEngine(
      new PlaywrightScraperEngine(
        new BrowserDocumentAdapter(fixturePolicy, capacity),
        fixturePolicy
      ),
      [external]
    );
    const session = await worker.open(
      'https://example.com',
      fixturePlan(),
      createExecutionContext(1000),
      {}
    );
    await expect(probe.fetchHtml('https://example.com')).rejects.toBeInstanceOf(
      BrowserCapacityError
    );
    expect(launch).toHaveBeenCalledTimes(1);
    expect(external.fetchHtml).not.toHaveBeenCalled();
    await Promise.all([session.close(), session.close()]);
    expect(first.context.close).toHaveBeenCalledTimes(1);
    expect(first.browser.close).toHaveBeenCalledTimes(1);
    expect(store.held.size).toBe(0);
    await expect(probe.fetchHtml('https://example.com')).resolves.toMatchObject({
      httpStatus: 200,
    });
    expect(store.held.size).toBe(0);
  });
  it('releases capacity if Chromium launch fails', async () => {
    const store = new InMemoryLeaseStore();
    const adapter = new BrowserDocumentAdapter(fixturePolicy, new BrowserCapacity(store, 1));
    launch.mockRejectedValueOnce(new Error('launch failed'));
    await expect(
      adapter.open('https://example.com', fixturePlan(), createExecutionContext(1000), {})
    ).rejects.toThrow('launch failed');
    expect(store.held.size).toBe(0);
  });
  it('keeps capacity reserved until a browser cancelled during launch has closed', async () => {
    const store = new InMemoryLeaseStore();
    const capacity = new BrowserCapacity(store, 1);
    const adapter = new BrowserDocumentAdapter(fixturePolicy, capacity);
    const controller = new AbortController();
    const fixture = browserFixture();
    let completeLaunch!: (value: unknown) => void;
    launch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeLaunch = resolve;
        })
    );
    const pending = adapter.open(
      'https://example.com',
      fixturePlan(),
      createExecutionContext(1000, controller.signal),
      {}
    );
    const rejection = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(store.held.size).toBe(1);
    completeLaunch(fixture.browser);
    await rejection;
    expect(fixture.browser.close).toHaveBeenCalledTimes(1);
    expect(store.held.size).toBe(0);
  });
  it('closes a browser after resource ownership is lost', async () => {
    const store = new InMemoryLeaseStore();
    const fixture = browserFixture();
    launch.mockResolvedValue(fixture.browser);
    const session = await new BrowserDocumentAdapter(
      fixturePolicy,
      new BrowserCapacity(store, 1)
    ).open('https://example.com', fixturePlan(), createExecutionContext(1000), {});
    [...store.held.values()][0]!.abort(new Error('ownership lost'));
    await vi.waitFor(() => expect(fixture.browser.close).toHaveBeenCalledTimes(1));
    await expect(session.snapshot()).rejects.toThrow('ownership lost');
    await session.close();
    expect(store.held.size).toBe(0);
  });
});
