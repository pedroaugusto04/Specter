import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import type { ScrapeOptions, ScrapeResult } from '../scraper.interface.js';
import {
  UnblockerError,
  UnblockerQuotaExhaustedError,
  type IUnblockerProvider,
} from './unblocker.interface.js';

export class ScrapingBeeUnblockerProvider implements IUnblockerProvider {
  public readonly name = 'scrapingbee';
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { apiKey?: string; fetchFn?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? env.SCRAPINGBEE_API_KEY;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    if (!this.isEnabled()) {
      throw new UnblockerError(this.name, 'API key is not configured.');
    }

    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? env.PLAYWRIGHT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = new URL('https://app.scrapingbee.com/api/v1/');
      endpoint.searchParams.set('api_key', this.apiKey.trim());
      endpoint.searchParams.set('url', targetUrl);
      endpoint.searchParams.set('render_js', 'true');
      endpoint.searchParams.set('premium_proxy', 'true');
      endpoint.searchParams.set('block_resources', 'false');
      endpoint.searchParams.set('block_ads', 'true');

      if (targetUrl.includes('.com.br')) {
        endpoint.searchParams.set('country_code', 'br');
      }

      if (options?.waitForSelector) {
        endpoint.searchParams.set('wait_for', options.waitForSelector);
      }

      const response = await this.fetchFn(endpoint.toString(), {
        method: 'GET',
        signal: controller.signal,
      });

      const httpStatus = response.status;
      const rawHtml = await response.text();

      // ScrapingBee returns 429 when concurrency/rate limits hit, 401/403/402 when credits depleted
      if (httpStatus === 429 || httpStatus === 402) {
        throw new UnblockerQuotaExhaustedError(
          this.name,
          `ScrapingBee credit limit exhausted or rate-limited (HTTP ${httpStatus})`,
          httpStatus
        );
      }

      if (
        (httpStatus === 401 || httpStatus === 403) &&
        (rawHtml.toLowerCase().includes('credit') ||
          rawHtml.toLowerCase().includes('limit') ||
          rawHtml.toLowerCase().includes('quota') ||
          rawHtml.toLowerCase().includes('usage'))
      ) {
        throw new UnblockerQuotaExhaustedError(
          this.name,
          `ScrapingBee quota depleted: ${rawHtml.slice(0, 150)}`,
          httpStatus
        );
      }

      if (!response.ok) {
        throw new UnblockerError(
          this.name,
          `Request failed with HTTP ${httpStatus}: ${rawHtml.slice(0, 200)}`,
          httpStatus
        );
      }

      // Verify that the destination page itself did not return an unhandled challenge
      detectAntiBotBlock(targetUrl, rawHtml, httpStatus);

      return {
        rawHtml,
        httpStatus,
        url: targetUrl,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      if (err instanceof UnblockerError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new UnblockerError(this.name, `Request timed out after ${timeoutMs}ms`, 504, err);
      }
      throw new UnblockerError(
        this.name,
        err instanceof Error ? err.message : String(err),
        500,
        err
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
