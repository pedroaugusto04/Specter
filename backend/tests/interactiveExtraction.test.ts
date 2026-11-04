import { BrowserCapacity } from '../src/resources/browserCapacity.js';
import { InMemoryLeaseStore } from './helpers/resourceFixtures.js';
import { standardSourceReaders } from '../src/extraction/sources.js';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BrowserDocumentAdapter } from '../src/extraction/adapters/browserDocument.adapter.js';
import { ExtractionExecutor } from '../src/extraction/executor.js';
import { PageExtractor } from '../src/extraction/pageExtractor.js';
import { fixturePlan, fixturePolicy } from './helpers/extractionFixtures.js';
vi.mock('../src/utils/ssrfValidator.js', () => ({
  assertSafeUrl: async (url: string) => {
    if (new URL(url).hostname !== '127.0.0.1') throw new Error('Unexpected test destination');
    return url;
  },
}));
let server: Server;
let base: string;
beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    const route = request.url;
    if (route === '/expand') {
      response.end(
        '<main><button aria-expanded="false" onclick="this.insertAdjacentHTML(\'afterend\', \'<h1>Expanded title</h1>\');this.remove()">Details</button></main>'
      );
      return;
    }
    if (route === '/virtual') {
      response.end(
        '<main><div id="list" style="height:80px;overflow:auto" onscroll="this.innerHTML=\'<article data-id=&quot;b&quot;><b>Second</b></article><i class=&quot;end&quot;></i>\';this.onscroll=null"><article data-id="a"><b>First</b></article><div style="height:400px"></div></div></main>'
      );
      return;
    }
    if (route === '/data') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ items: [{ id: 'a', name: 'Network record' }], done: true }));
      return;
    }
    if (route === '/network') {
      response.end('<main>Loading</main><script>setTimeout(()=>fetch("/data"), 100)</script>');
      return;
    }
    if (route === '/frame') {
      response.end('<iframe src="/content"></iframe>');
      return;
    }
    if (route === '/content') {
      response.end('<main><h1>Framed title</h1></main>');
      return;
    }
    if (route === '/shadow') {
      response.end(
        '<x-panel></x-panel><script>document.querySelector("x-panel").attachShadow({mode:"open"}).innerHTML="<h1>Shadow title</h1>"</script>'
      );
      return;
    }
    if (route === '/stuck') {
      response.end(
        '<main><article data-id="a"><b>First</b></article><button onclick="this.textContent=Date.now()">Load more</button></main>'
      );
      return;
    }
    response.end(
      `<main><article data-id="a"><b>First</b></article><button onclick="this.disabled=true;setTimeout(()=>{this.insertAdjacentHTML('beforebegin', '<article data-id=&quot;b&quot;><b>Second</b></article><i class=&quot;end&quot;></i>');this.remove()},150)">Load more</button></main>`
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture');
  base = 'http://127.0.0.1:' + address.port;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});
const policy = { ...fixturePolicy, timeoutMs: 12000, actionTimeoutMs: 1500 };
const adapter = new BrowserDocumentAdapter(policy, new BrowserCapacity(new InMemoryLeaseStore()));
const executor = () =>
  new ExtractionExecutor(
    { http: adapter, browser: adapter },
    new PageExtractor(standardSourceReaders()),
    policy
  );
function collection() {
  const plan = fixturePlan({
    mode: 'collection',
    containerSelector: 'article',
    readySelector: 'main',
    scope: 'collection',
    identityFields: ['id'],
    fields: {
      id: { type: 'string', sources: [{ kind: 'dom', selector: ':scope', attribute: 'data-id' }] },
      title: { type: 'string', sources: [{ kind: 'dom', selector: 'b', attribute: 'text' }] },
    },
    pagination: { kind: 'click', nextSelector: 'button', endSelector: '.end' },
  });
  plan.strategy.transport = 'browser';
  return plan;
}
describe('Browser adapter with common executor', () => {
  it('waits for delayed identities and terminal evidence', async () => {
    const result = await executor().execute(base, collection());
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toEqual({
      items: [
        { id: 'a', title: 'First' },
        { id: 'b', title: 'Second' },
      ],
      count: 2,
    });
  }, 20000);
  it('returns partial when unrelated DOM changes without new identities', async () => {
    const result = await executor().execute(base + '/stuck', collection());
    expect(result.report.quality).toBe('PARTIAL');
    expect(result.report.issues.join(' ')).toContain('No new identities');
  }, 20000);
  it('extracts observed JSON with response-based readiness', async () => {
    const plan = collection();
    plan.intent.scope = 'page';
    delete plan.strategy.pagination;
    plan.strategy.records = { kind: 'response', match: { urlPattern: '/data' }, path: ['items'] };
    plan.strategy.fields = {
      id: [{ kind: 'response', path: ['id'] }],
      title: [{ kind: 'response', path: ['name'] }],
    };
    plan.strategy.ready = [
      { kind: 'response', match: { urlPattern: '/data' }, path: ['done'], equals: true },
    ];
    const result = await executor().execute(base + '/network', plan);
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toMatchObject({ items: [{ title: 'Network record' }] });
  }, 20000);
  it('replays setup actions before validating fields', async () => {
    const plan = fixturePlan();
    plan.strategy.transport = 'browser';
    plan.strategy.setup = [
      { kind: 'click', locator: { kind: 'role', role: 'button', name: 'Details' } },
    ];
    plan.strategy.ready = [{ kind: 'field', field: 'title' }];
    const result = await executor().execute(base + '/expand', plan);
    expect(result.data).toEqual({ title: 'Expanded title' });
  }, 20000);
  it('accumulates virtualized identities while scrolling a container', async () => {
    const plan = collection();
    plan.strategy.pagination = {
      kind: 'scroll',
      scrollTarget: '#list',
      end: [{ kind: 'exists', locator: { kind: 'css', selector: '.end' } }],
    };
    const result = await executor().execute(base + '/virtual', plan);
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toMatchObject({ count: 2, items: [{ id: 'a' }, { id: 'b' }] });
  }, 20000);
  it('extracts frame and open shadow content', async () => {
    for (const [path, document, expected] of [
      ['/frame', { frame: 'iframe' }, 'Framed title'],
      ['/shadow', { shadow: 'x-panel' }, 'Shadow title'],
    ] as const) {
      const plan = fixturePlan();
      plan.strategy.transport = 'browser';
      plan.strategy.document = document;
      plan.strategy.records = { kind: 'dom', selector: 'h1' };
      plan.strategy.fields = { title: [{ kind: 'dom', selector: ':scope', attribute: 'text' }] };
      plan.strategy.ready = [{ kind: 'field', field: 'title' }];
      const result = await executor().execute(base + path, plan);
      expect(result.report.quality).toBe('COMPLETE');
      expect(result.data).toEqual({ title: expected });
    }
  }, 20000);
});
