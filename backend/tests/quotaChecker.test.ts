import { describe, expect, it, vi } from 'vitest';
import {
  checkScraperApiQuota,
  checkScrapingBeeQuota,
  checkCrawlbaseQuota,
  logProviderQuotasOnStartup,
} from '../src/providers/scraping/unblockers/quotaChecker.js';

describe('Unblocker Quota Checker', () => {
  describe('checkScraperApiQuota', () => {
    it('returns disabled when no API key is provided', async () => {
      const res = await checkScraperApiQuota('');
      expect(res.enabled).toBe(false);
      expect(res.provider).toBe('scraperapi');
    });

    it('parses ScraperAPI account quota data correctly', async () => {
      const mockFetch: typeof fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            requestLimit: 1000,
            requestCount: 42,
            concurrencyLimit: 5,
          }),
      } as unknown as Response);

      const res = await checkScraperApiQuota('test-api-key', mockFetch);
      expect(res.enabled).toBe(true);
      expect(res.provider).toBe('scraperapi');
      expect(res.limit).toBe(1000);
      expect(res.used).toBe(42);
      expect(res.remaining).toBe(958);
      expect(res.details).toContain('958 / 1000');
    });

    it('handles HTTP error gracefully without throwing', async () => {
      const mockFetch: typeof fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as unknown as Response);

      const res = await checkScraperApiQuota('invalid-key', mockFetch);
      expect(res.enabled).toBe(true);
      expect(res.error).toContain('HTTP 401');
    });
  });

  describe('checkScrapingBeeQuota', () => {
    it('returns disabled when no API key is provided', async () => {
      const res = await checkScrapingBeeQuota('');
      expect(res.enabled).toBe(false);
      expect(res.provider).toBe('scrapingbee');
    });

    it('parses ScrapingBee usage data correctly', async () => {
      const mockFetch: typeof fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            max_api_credit: 1000,
            used_api_credit: 120,
          }),
      } as unknown as Response);

      const res = await checkScrapingBeeQuota('test-bee-key', mockFetch);
      expect(res.enabled).toBe(true);
      expect(res.provider).toBe('scrapingbee');
      expect(res.limit).toBe(1000);
      expect(res.used).toBe(120);
      expect(res.remaining).toBe(880);
      expect(res.details).toContain('880 / 1000');
    });
  });

  describe('checkCrawlbaseQuota', () => {
    it('returns disabled when no token is provided', async () => {
      const res = await checkCrawlbaseQuota('');
      expect(res.enabled).toBe(false);
      expect(res.provider).toBe('crawlbase');
    });

    it('parses Crawlbase account data correctly', async () => {
      const mockFetch: typeof fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            remaining_requests: 950,
            total_requests: 1000,
            requests_count: 50,
          }),
      } as unknown as Response);

      const res = await checkCrawlbaseQuota('test-crawlbase-token', mockFetch);
      expect(res.enabled).toBe(true);
      expect(res.provider).toBe('crawlbase');
      expect(res.remaining).toBe(950);
      expect(res.limit).toBe(1000);
    });
  });

  describe('logProviderQuotasOnStartup', () => {
    it('executes without crashing when no unblockers configured', async () => {
      await expect(logProviderQuotasOnStartup()).resolves.not.toThrow();
    });
  });
});
