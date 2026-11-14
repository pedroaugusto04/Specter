import { describe, expect, it, vi } from 'vitest';
import { AntiBotBlockedError } from '../src/errors/domainErrors.js';
import { AccessScraperEngine } from '../src/providers/scraping/accessScraper.provider.js';
import type { IScraperEngine, ScrapeResult } from '../src/providers/scraping/scraper.interface.js';
import {
  UnblockerQuotaExhaustedError,
  type IUnblockerProvider,
} from '../src/providers/scraping/unblockers/unblocker.interface.js';
import { ZenRowsUnblockerProvider } from '../src/providers/scraping/unblockers/zenRows.provider.js';
import { ScraperApiUnblockerProvider } from '../src/providers/scraping/unblockers/scraperApi.provider.js';
import { ScrapingBeeUnblockerProvider } from '../src/providers/scraping/unblockers/scrapingBee.provider.js';
import { CrawlbaseUnblockerProvider } from '../src/providers/scraping/unblockers/crawlbase.provider.js';
import { DecodoUnblockerProvider } from '../src/providers/scraping/unblockers/decodo.provider.js';

describe('Anti-Bot Unblockers & Cascade Fallback Scraper Engine', () => {
  describe('ZenRowsUnblockerProvider', () => {
    it('is disabled when no API key is provided', () => {
      const provider = new ZenRowsUnblockerProvider({ apiKey: '' });
      expect(provider.isEnabled()).toBe(false);
    });

    it('fetches HTML successfully when enabled and status is 200', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: () => Promise.resolve('<html><body><h1>Product Title</h1></body></html>'),
      } as unknown as Response);

      const provider = new ZenRowsUnblockerProvider({
        apiKey: 'test-zenrows-key',
        fetchFn: mockFetch,
      });
      expect(provider.isEnabled()).toBe(true);

      const result = await provider.fetchHtml('https://example.com/product');
      expect(result.httpStatus).toBe(200);
      expect(result.rawHtml).toContain('Product Title');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const calledUrl = new URL(mockFetch.mock.calls[0]![0]);
      expect(calledUrl.origin).toBe('https://api.zenrows.com');
      expect(calledUrl.searchParams.get('apikey')).toBe('test-zenrows-key');
      expect(calledUrl.searchParams.get('url')).toBe('https://example.com/product');
      expect(calledUrl.searchParams.get('js_render')).toBe('true');
    });

    it('captures screenshot when captureScreenshot is enabled in ZenRows', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              html: '<html><body><h1>Product Page</h1></body></html>',
              screenshot: { data: Buffer.from('fake-screenshot-data').toString('base64') },
            })
          ),
      } as unknown as Response);

      const provider = new ZenRowsUnblockerProvider({
        apiKey: 'test-zenrows-key',
        fetchFn: mockFetch,
      });

      const result = await provider.fetchHtml('https://example.com/product', {
        captureScreenshot: true,
        waitForSelector: '.price-tag',
      });

      expect(result.rawHtml).toBe('<html><body><h1>Product Page</h1></body></html>');
      expect(result.screenshot).toBeDefined();
      expect(result.screenshot?.toString()).toBe('fake-screenshot-data');

      const calledUrl = new URL(mockFetch.mock.calls[0]![0]);
      expect(calledUrl.searchParams.get('screenshot')).toBe('true');
      expect(calledUrl.searchParams.get('json_response')).toBe('true');
      expect(calledUrl.searchParams.get('screenshot_format')).toBe('jpeg');
      expect(calledUrl.searchParams.get('screenshot_selector')).toBe('.price-tag');
    });

    it('throws UnblockerQuotaExhaustedError when HTTP 429 rate-limited', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 429,
        ok: false,
        text: () => Promise.resolve('Too Many Requests'),
      } as unknown as Response);

      const provider = new ZenRowsUnblockerProvider({
        apiKey: 'test-zenrows-key',
        fetchFn: mockFetch,
      });
      await expect(provider.fetchHtml('https://example.com')).rejects.toThrow(
        UnblockerQuotaExhaustedError
      );
    });

    it('retries with premium proxy only when standard attempt is challenged by anti-bot', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          text: () =>
            Promise.resolve('<html><head><title>Attention Required! | Cloudflare</title></head></html>'),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          text: () =>
            Promise.resolve('<html><body><h1>Unblocked Product</h1></body></html>'),
        } as unknown as Response);

      const provider = new ZenRowsUnblockerProvider({
        apiKey: 'test-zenrows-key',
        fetchFn: mockFetch,
      });

      const result = await provider.fetchHtml('https://example.com/product');
      expect(result.rawHtml).toContain('Unblocked Product');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstCallUrl = new URL(mockFetch.mock.calls[0]![0]);
      expect(firstCallUrl.searchParams.has('premium_proxy')).toBe(false);

      const secondCallUrl = new URL(mockFetch.mock.calls[1]![0]);
      expect(secondCallUrl.searchParams.get('premium_proxy')).toBe('true');
    });

    it('does not send proxy_country on standard proxy attempt for ccTLD, but sends both on premium retry', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          text: () =>
            Promise.resolve('<html><head><title>Attention Required! | Cloudflare</title></head></html>'),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          text: () =>
            Promise.resolve('<html><body><h1>Mercado Livre BR Produto</h1></body></html>'),
        } as unknown as Response);

      const provider = new ZenRowsUnblockerProvider({
        apiKey: 'test-zenrows-key',
        fetchFn: mockFetch,
      });

      const result = await provider.fetchHtml('https://www.mercadolivre.com.br/produto/123');
      expect(result.rawHtml).toContain('Mercado Livre BR Produto');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstCallUrl = new URL(mockFetch.mock.calls[0]![0]);
      expect(firstCallUrl.searchParams.has('premium_proxy')).toBe(false);
      expect(firstCallUrl.searchParams.has('proxy_country')).toBe(false);

      const secondCallUrl = new URL(mockFetch.mock.calls[1]![0]);
      expect(secondCallUrl.searchParams.get('premium_proxy')).toBe('true');
      expect(secondCallUrl.searchParams.get('proxy_country')).toBe('br');
    });

    it('retries with premium proxy when standard attempt fails with proxy_country 400 error', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 400,
          ok: false,
          text: () =>
            Promise.resolve(
              '{"code":"REQS004","title":"Invalid value provided for \'proxy_country\' parameter; proxy geolocation is only supported when \'premium_proxy\' is set to true"}'
            ),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          text: () =>
            Promise.resolve('<html><body><h1>Unblocked with Premium</h1></body></html>'),
        } as unknown as Response);

      const provider = new ZenRowsUnblockerProvider({
        apiKey: 'test-zenrows-key',
        fetchFn: mockFetch,
      });

      const result = await provider.fetchHtml('https://www.mercadolivre.com.br/produto/123');
      expect(result.rawHtml).toContain('Unblocked with Premium');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const secondCallUrl = new URL(mockFetch.mock.calls[1]![0]);
      expect(secondCallUrl.searchParams.get('premium_proxy')).toBe('true');
      expect(secondCallUrl.searchParams.get('proxy_country')).toBe('br');
    });
  });

  describe('ScraperApiUnblockerProvider', () => {
    it('captures screenshot when captureScreenshot is enabled in ScraperAPI', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          text: () => Promise.resolve('<html><body><h1>ScraperApi Product</h1></body></html>'),
          headers: new Headers({
            'sa-screenshot': 'https://api.scraperapi.com/screenshots/fake-id.png',
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('scraperapi-screenshot-data')),
        } as unknown as Response);

      const provider = new ScraperApiUnblockerProvider({
        apiKey: 'test-scraperapi-key',
        fetchFn: mockFetch,
      });

      const result = await provider.fetchHtml('https://example.com/product', {
        captureScreenshot: true,
      });

      expect(result.rawHtml).toBe('<html><body><h1>ScraperApi Product</h1></body></html>');
      expect(result.screenshot).toBeDefined();
      expect(result.screenshot?.toString()).toBe('scraperapi-screenshot-data');

      const calledUrl = new URL(mockFetch.mock.calls[0]![0]);
      expect(calledUrl.searchParams.get('screenshot')).toBe('true');
    });

    it('detects quota depletion on HTTP 403 with quota response message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 403,
        ok: false,
        text: () =>
          Promise.resolve(
            'Your request failed due to exceeding account concurrency or monthly quota.'
          ),
      } as unknown as Response);

      const provider = new ScraperApiUnblockerProvider({
        apiKey: 'test-scraperapi-key',
        fetchFn: mockFetch,
      });
      await expect(provider.fetchHtml('https://example.com')).rejects.toThrow(
        UnblockerQuotaExhaustedError
      );
    });

    it('retries with premium residential proxy when standard proxy is challenged by anti-bot', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          headers: new Headers(),
          text: () =>
            Promise.resolve('<html><head><title>Attention Required! | Cloudflare</title></head></html>'),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          headers: new Headers(),
          text: () =>
            Promise.resolve('<html><body><h1>Unblocked via ScraperAPI Premium</h1></body></html>'),
        } as unknown as Response);

      const provider = new ScraperApiUnblockerProvider({
        apiKey: 'test-scraperapi-key',
        fetchFn: mockFetch,
      });

      const result = await provider.fetchHtml('https://example.com/product');
      expect(result.rawHtml).toContain('Unblocked via ScraperAPI Premium');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstCallUrl = new URL(mockFetch.mock.calls[0]![0]);
      expect(firstCallUrl.searchParams.has('premium')).toBe(false);

      const secondCallUrl = new URL(mockFetch.mock.calls[1]![0]);
      expect(secondCallUrl.searchParams.get('premium')).toBe('true');
    });

    it('does not send country_code on standard ScraperAPI attempt, but sends both on premium retry', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          headers: new Headers(),
          text: () =>
            Promise.resolve('<html><head><title>Attention Required! | Cloudflare</title></head></html>'),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          headers: new Headers(),
          text: () =>
            Promise.resolve('<html><body><h1>Unblocked via ScraperAPI Premium BR</h1></body></html>'),
        } as unknown as Response);

      const provider = new ScraperApiUnblockerProvider({
        apiKey: 'test-scraperapi-key',
        fetchFn: mockFetch,
      });

      const result = await provider.fetchHtml('https://www.mercadolivre.com.br/produto/123');
      expect(result.rawHtml).toContain('Unblocked via ScraperAPI Premium BR');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstCallUrl = new URL(mockFetch.mock.calls[0]![0]);
      expect(firstCallUrl.searchParams.has('premium')).toBe(false);
      expect(firstCallUrl.searchParams.has('country_code')).toBe(false);

      const secondCallUrl = new URL(mockFetch.mock.calls[1]![0]);
      expect(secondCallUrl.searchParams.get('premium')).toBe('true');
      expect(secondCallUrl.searchParams.get('country_code')).toBe('br');
    });
  });

  describe('ScrapingBeeUnblockerProvider', () => {
    it('captures screenshot when captureScreenshot is enabled in ScrapingBee', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              body: '<html><body><h1>ScrapingBee Product</h1></body></html>',
              screenshot: Buffer.from('scrapingbee-screenshot-data').toString('base64'),
            })
          ),
      } as unknown as Response);

      const provider = new ScrapingBeeUnblockerProvider({
        apiKey: 'test-bee-key',
        fetchFn: mockFetch,
      });

      const result = await provider.fetchHtml('https://example.com/product', {
        captureScreenshot: true,
        waitForSelector: '#price',
      });

      expect(result.rawHtml).toBe('<html><body><h1>ScrapingBee Product</h1></body></html>');
      expect(result.screenshot).toBeDefined();
      expect(result.screenshot?.toString()).toBe('scrapingbee-screenshot-data');

      const calledUrl = new URL(mockFetch.mock.calls[0]![0]);
      expect(calledUrl.searchParams.get('screenshot')).toBe('true');
      expect(calledUrl.searchParams.get('json_response')).toBe('true');
      expect(calledUrl.searchParams.get('screenshot_selector')).toBe('#price');
    });

    it('throws UnblockerQuotaExhaustedError on 401 quota limit', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        text: () => Promise.resolve('{"message": "API credit limit reached"}'),
      } as unknown as Response);

      const provider = new ScrapingBeeUnblockerProvider({
        apiKey: 'test-bee-key',
        fetchFn: mockFetch,
      });
      await expect(provider.fetchHtml('https://example.com')).rejects.toThrow(
        UnblockerQuotaExhaustedError
      );
    });

    it('does not send country_code on standard ScrapingBee attempt, but sends both on premium retry', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          text: () =>
            Promise.resolve('<html><head><title>Attention Required! | Cloudflare</title></head></html>'),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          text: () =>
            Promise.resolve('<html><body><h1>ScrapingBee BR Unblocked</h1></body></html>'),
        } as unknown as Response);

      const provider = new ScrapingBeeUnblockerProvider({
        apiKey: 'test-bee-key',
        fetchFn: mockFetch,
      });

      const result = await provider.fetchHtml('https://www.mercadolivre.com.br/produto/123');
      expect(result.rawHtml).toContain('ScrapingBee BR Unblocked');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstCallUrl = new URL(mockFetch.mock.calls[0]![0]);
      expect(firstCallUrl.searchParams.has('premium_proxy')).toBe(false);
      expect(firstCallUrl.searchParams.has('country_code')).toBe(false);

      const secondCallUrl = new URL(mockFetch.mock.calls[1]![0]);
      expect(secondCallUrl.searchParams.get('premium_proxy')).toBe('true');
      expect(secondCallUrl.searchParams.get('country_code')).toBe('br');
    });
  });

  describe('CrawlbaseUnblockerProvider', () => {
    it('captures screenshot when captureScreenshot is enabled in Crawlbase', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          text: () => Promise.resolve('<html><body><h1>Crawlbase Product</h1></body></html>'),
          headers: new Headers({
            screenshot_url: 'https://api.crawlbase.com/screenshots/fake-id.jpg',
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('crawlbase-screenshot-data')),
        } as unknown as Response);

      const provider = new CrawlbaseUnblockerProvider({
        token: 'test-crawlbase-token',
        fetchFn: mockFetch,
      });

      const result = await provider.fetchHtml('https://example.com/product', {
        captureScreenshot: true,
      });

      expect(result.rawHtml).toBe('<html><body><h1>Crawlbase Product</h1></body></html>');
      expect(result.screenshot).toBeDefined();
      expect(result.screenshot?.toString()).toBe('crawlbase-screenshot-data');

      const calledUrl = new URL(mockFetch.mock.calls[0]![0]);
      expect(calledUrl.searchParams.get('screenshot')).toBe('true');
    });

    it('throws UnblockerQuotaExhaustedError on 503 or 429', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 503,
        ok: false,
        text: () => Promise.resolve('Service overloaded / rate limited'),
      } as unknown as Response);

      const provider = new CrawlbaseUnblockerProvider({
        token: 'test-crawlbase-token',
        fetchFn: mockFetch,
      });
      await expect(provider.fetchHtml('https://example.com')).rejects.toThrow(
        UnblockerQuotaExhaustedError
      );
    });
  });

  describe('DecodoUnblockerProvider', () => {
    it('is disabled when no API key is provided', () => {
      const provider = new DecodoUnblockerProvider({ apiKey: '' });
      expect(provider.isEnabled()).toBe(false);
    });

    it('fetches HTML successfully when enabled and status is 200', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              results: [
                {
                  content: '<html><body><h1>Decodo Data</h1></body></html>',
                  status_code: 200,
                },
              ],
            })
          ),
      } as unknown as Response);

      const provider = new DecodoUnblockerProvider({
        apiKey: 'test-decodo-key',
        fetchFn: mockFetch,
      });
      expect(provider.isEnabled()).toBe(true);

      const result = await provider.fetchHtml('https://example.com');
      expect(result.httpStatus).toBe(200);
      expect(result.rawHtml).toContain('Decodo Data');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledInit] = mockFetch.mock.calls[0]!;
      expect(calledUrl).toBe('https://data.decodo.com/v1/scrape');
      expect(calledInit.method).toBe('POST');
      expect(calledInit.headers.Authorization).toBe('Bearer test-decodo-key');

      const body = JSON.parse(calledInit.body);
      expect(body.url).toBe('https://example.com');
      expect(body.proxy_pool).toBe('standard');
      expect(body.headless).toBe('html');
    });

    it('throws UnblockerQuotaExhaustedError when status is 429 or 401', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ message: 'Invalid credentials or quota exhausted' })),
      } as unknown as Response);

      const provider = new DecodoUnblockerProvider({
        apiKey: 'test-decodo-key',
        fetchFn: mockFetch,
      });

      await expect(provider.fetchHtml('https://example.com')).rejects.toThrow(
        UnblockerQuotaExhaustedError
      );
    });
  });

  describe('AccessScraperEngine', () => {
    const mockSuccessResult: ScrapeResult = {
      rawHtml: '<html><body>Success</body></html>',
      httpStatus: 200,
      url: 'https://example.com',
      durationMs: 150,
    };

    it('uses the first enabled provider after local access is blocked', async () => {
      const unblocker1: IUnblockerProvider = {
        name: 'zenrows',
        isEnabled: () => true,
        fetchHtml: vi.fn().mockResolvedValue(mockSuccessResult),
      };

      const unblocker2: IUnblockerProvider = {
        name: 'scraperapi',
        isEnabled: () => true,
        fetchHtml: vi.fn(),
      };

      const localEngine: IScraperEngine = {
        name: 'playwright',
        fetchHtml: vi.fn().mockRejectedValue(new AntiBotBlockedError('Blocked')),
      };

      const cascade = new AccessScraperEngine(localEngine, [unblocker1, unblocker2]);
      const res = await cascade.fetchHtml('https://example.com');

      expect(res.rawHtml).toContain('Success');
      expect(unblocker1.fetchHtml).toHaveBeenCalledTimes(1);
      expect(unblocker2.fetchHtml).not.toHaveBeenCalled();
      expect(localEngine.fetchHtml).toHaveBeenCalledTimes(1);
    });

    it('cascades to the second unblocker when the first provider exhausts its quota', async () => {
      const unblocker1: IUnblockerProvider = {
        name: 'zenrows',
        isEnabled: () => true,
        fetchHtml: vi
          .fn()
          .mockRejectedValue(new UnblockerQuotaExhaustedError('zenrows', 'Out of free credits')),
      };

      const unblocker2: IUnblockerProvider = {
        name: 'scraperapi',
        isEnabled: () => true,
        fetchHtml: vi.fn().mockResolvedValue({
          ...mockSuccessResult,
          rawHtml: '<html><body>From ScraperAPI</body></html>',
        }),
      };

      const localEngine: IScraperEngine = {
        name: 'playwright',
        fetchHtml: vi.fn().mockRejectedValue(new AntiBotBlockedError('Blocked')),
      };

      const cascade = new AccessScraperEngine(localEngine, [unblocker1, unblocker2]);
      const res = await cascade.fetchHtml('https://example.com');

      expect(res.rawHtml).toContain('From ScraperAPI');
      expect(unblocker1.fetchHtml).toHaveBeenCalledTimes(1);
      expect(unblocker2.fetchHtml).toHaveBeenCalledTimes(1);
      expect(localEngine.fetchHtml).toHaveBeenCalledTimes(1);
    });

    it('prefers local access without consuming provider quota', async () => {
      const unblocker1: IUnblockerProvider = {
        name: 'zenrows',
        isEnabled: () => true,
        fetchHtml: vi.fn().mockRejectedValue(new UnblockerQuotaExhaustedError('zenrows')),
      };

      const localEngine: IScraperEngine = {
        name: 'playwright',
        fetchHtml: vi.fn().mockResolvedValue({
          ...mockSuccessResult,
          rawHtml: '<html><body>From Local Playwright</body></html>',
        }),
      };

      const cascade = new AccessScraperEngine(localEngine, [unblocker1]);
      const res = await cascade.fetchHtml('https://example.com');

      expect(res.rawHtml).toContain('From Local Playwright');
      expect(unblocker1.fetchHtml).not.toHaveBeenCalled();
      expect(localEngine.fetchHtml).toHaveBeenCalledTimes(1);
    });

    it('falls back directly to localEngine when no unblockers are enabled', async () => {
      const unblocker1: IUnblockerProvider = {
        name: 'zenrows',
        isEnabled: () => false,
        fetchHtml: vi.fn(),
      };

      const localEngine: IScraperEngine = {
        name: 'playwright',
        fetchHtml: vi.fn().mockResolvedValue(mockSuccessResult),
      };

      const cascade = new AccessScraperEngine(localEngine, [unblocker1]);
      const res = await cascade.fetchHtml('https://example.com');

      expect(res.rawHtml).toContain('Success');
      expect(unblocker1.fetchHtml).not.toHaveBeenCalled();
      expect(localEngine.fetchHtml).toHaveBeenCalledTimes(1);
    });

    it('reports exhaustion without exposing provider errors', async () => {
      const unblocker1: IUnblockerProvider = {
        name: 'zenrows',
        isEnabled: () => true,
        fetchHtml: vi
          .fn()
          .mockRejectedValue(new UnblockerQuotaExhaustedError('zenrows', 'Credit limit reached')),
      };

      const localEngine: IScraperEngine = {
        name: 'playwright',
        fetchHtml: vi
          .fn()
          .mockRejectedValue(new AntiBotBlockedError('Cloudflare 403 Forbidden', 403)),
      };

      const cascade = new AccessScraperEngine(localEngine, [unblocker1]);

      await expect(cascade.fetchHtml('https://example.com')).rejects.toThrow(
        'Acquisition alternatives exhausted.'
      );
    });
  });
});
