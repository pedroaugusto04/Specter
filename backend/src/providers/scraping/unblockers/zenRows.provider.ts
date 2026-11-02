import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import type { ScrapeOptions, ScrapeResult } from '../scraper.interface.js';
import {
  UnblockerError,
  UnblockerQuotaExhaustedError,
  type IUnblockerProvider,
} from './unblocker.interface.js';

export class ZenRowsUnblockerProvider implements IUnblockerProvider {
  public readonly name = 'zenrows';
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { apiKey?: string; fetchFn?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? env.ZENROWS_API_KEY;
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
      const endpoint = new URL('https://api.zenrows.com/v1/');
      endpoint.searchParams.set('apikey', this.apiKey.trim());
      endpoint.searchParams.set('url', targetUrl);
      endpoint.searchParams.set('js_render', 'true');
      endpoint.searchParams.set('premium_proxy', 'true');

      if (options?.waitForSelector) {
        endpoint.searchParams.set('wait_for', options.waitForSelector);
      }

      const response = await this.fetchFn(endpoint.toString(), {
        method: 'GET',
        signal: controller.signal,
      });

      const httpStatus = response.status;
      const rawHtml = await response.text();

      // Check for rate limit or exhausted quota
      if (httpStatus === 429 || httpStatus === 402) {
        throw new UnblockerQuotaExhaustedError(
          this.name,
          `ZenRows quota exhausted or rate limit hit (HTTP ${httpStatus})`,
          httpStatus
        );
      }

      if (rawHtml.includes('PAYMENT_REQUIRED') || rawHtml.includes('QUOTA_EXCEEDED')) {
        throw new UnblockerQuotaExhaustedError(
          this.name,
          'ZenRows response indicated quota exceeded or payment required',
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
      throw new UnblockerError(this.name, err instanceof Error ? err.message : String(err), 500, err);
    } finally {
      clearTimeout(timer);
    }
  }
}
