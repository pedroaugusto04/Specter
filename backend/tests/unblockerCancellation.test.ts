import { describe, expect, it, vi } from 'vitest';
import { ZenRowsUnblockerProvider } from '../src/providers/scraping/unblockers/zenRows.provider.js';
import { ScraperApiUnblockerProvider } from '../src/providers/scraping/unblockers/scraperApi.provider.js';
import { ScrapingBeeUnblockerProvider } from '../src/providers/scraping/unblockers/scrapingBee.provider.js';
import { CrawlbaseUnblockerProvider } from '../src/providers/scraping/unblockers/crawlbase.provider.js';
const providers = [
  (fetchFn: typeof fetch) => new ZenRowsUnblockerProvider({ apiKey: 'fixture', fetchFn }),
  (fetchFn: typeof fetch) => new ScraperApiUnblockerProvider({ apiKey: 'fixture', fetchFn }),
  (fetchFn: typeof fetch) => new ScrapingBeeUnblockerProvider({ apiKey: 'fixture', fetchFn }),
  (fetchFn: typeof fetch) => new CrawlbaseUnblockerProvider({ token: 'fixture', fetchFn }),
];
for (const create of providers) {
  const name = create(vi.fn()).name;
  describe(name + ' cancellation contract', () => {
    it('rejects an expired request with the normalized timeout status', async () => {
      const fetchFn = vi.fn<typeof fetch>(
        async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init!.signal!;
            if (signal.aborted) return reject(signal.reason);
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          })
      );
      await expect(
        create(fetchFn).fetchHtml('https://example.com', { timeoutMs: 20 })
      ).rejects.toMatchObject({ providerName: name, httpStatus: 504 });
      expect(fetchFn).toHaveBeenCalledOnce();
    });
    it('does not send a request after caller cancellation', async () => {
      const fetchFn = vi.fn<typeof fetch>();
      const controller = new AbortController();
      controller.abort();
      await expect(
        create(fetchFn).fetchHtml('https://example.com', { signal: controller.signal })
      ).rejects.toMatchObject({ providerName: name, httpStatus: 504 });
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
}
