import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import { fetchRemoteScreenshot } from '../../../utils/screenshotHelper.js';
import type { ScrapeOptions, ScrapeResult } from '../scraper.interface.js';
import {
  UnblockerError,
  UnblockerQuotaExhaustedError,
  type IUnblockerProvider,
} from './unblocker.interface.js';

export class ScraperApiUnblockerProvider implements IUnblockerProvider {
  public readonly name = 'scraperapi';
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { apiKey?: string; fetchFn?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? env.SCRAPERAPI_KEY;
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
      const endpoint = new URL('https://api.scraperapi.com/');
      endpoint.searchParams.set('api_key', this.apiKey.trim());
      endpoint.searchParams.set('url', targetUrl);
      endpoint.searchParams.set('render', 'true');
      endpoint.searchParams.set('premium', 'true');

      if (options?.captureScreenshot) {
        endpoint.searchParams.set('screenshot', 'true');
      }

      const response = await this.fetchFn(endpoint.toString(), {
        method: 'GET',
        signal: controller.signal,
      });

      const httpStatus = response.status;
      const rawHtml = await response.text();

      // ScraperAPI uses 429 for rate limit, 403 when plan credits are exhausted
      if (httpStatus === 429 || httpStatus === 402) {
        throw new UnblockerQuotaExhaustedError(
          this.name,
          `ScraperAPI rate-limit hit or quota exhausted (HTTP ${httpStatus})`,
          httpStatus
        );
      }

      if (
        httpStatus === 403 &&
        (rawHtml.toLowerCase().includes('quota') ||
          rawHtml.toLowerCase().includes('concurrent') ||
          rawHtml.toLowerCase().includes('credits') ||
          rawHtml.toLowerCase().includes('unauthorized'))
      ) {
        throw new UnblockerQuotaExhaustedError(
          this.name,
          `ScraperAPI credits depleted or concurrency limit exceeded: ${rawHtml.slice(0, 150)}`,
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

      let screenshot: Buffer | undefined;
      const screenshotUrl = response.headers.get('sa-screenshot');
      if (options?.captureScreenshot && screenshotUrl) {
        screenshot = await fetchRemoteScreenshot(screenshotUrl, this.fetchFn, controller.signal);
      }

      // Verify that the destination page itself did not return an unhandled challenge
      detectAntiBotBlock(targetUrl, rawHtml, httpStatus);

      return {
        rawHtml,
        httpStatus,
        url: targetUrl,
        durationMs: Date.now() - startTime,
        screenshot,
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
