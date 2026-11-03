import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PlaywrightScraperEngine } from '../src/providers/scraping/playwrightScraper.provider.js';
import { extractionPlanSchema } from '../src/types/extractionPlan.js';

// The local fixture server is the only permitted network destination in this suite.
vi.mock('../src/utils/ssrfValidator.js', () => ({
  assertSafeUrl: async (url: string) => {
    if (new URL(url).hostname !== '127.0.0.1') throw new Error('Unexpected test network request.');
    return url;
  },
}));
let server: Server;
let url: string;
beforeAll(async () => {
  server = createServer((_, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      `<main><article data-id="a"><b>First</b></article><button onclick="this.insertAdjacentHTML('beforebegin', '<article data-id=&quot;b&quot;><b>Second</b></article><i class=&quot;end&quot;></i>'); this.remove()">Load more</button></main>`
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server failed.');
  url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});
describe('Interactive collection execution', () => {
  it(
    'executes load-more in a real browser and verifies the terminal marker',
    async () => {
    const plan = extractionPlanSchema.parse({
      version: 2,
      mode: 'collection',
      containerSelector: 'article',
      readySelector: 'main',
      scope: 'collection',
      identityFields: ['id'],
      fields: {
        id: {
          type: 'string',
          sources: [{ kind: 'dom', selector: ':scope', attribute: 'data-id' }],
        },
        title: { type: 'string', sources: [{ kind: 'dom', selector: 'b', attribute: 'text' }] },
      },
      pagination: { kind: 'click', nextSelector: 'button', endSelector: '.end' },
    });
    const result = await new PlaywrightScraperEngine().executePlan(url, plan);
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toEqual({
      items: [
        { id: 'a', title: 'First' },
        { id: 'b', title: 'Second' },
      ],
      count: 2,
    });
    },
    30_000
  );
});
