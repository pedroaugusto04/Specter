import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import { fetchRemoteScreenshot } from '../../../utils/screenshotHelper.js';
import type { ScrapeOptions, ScrapeResult } from '../scraper.interface.js';
import {
  UnblockerError,
  UnblockerQuotaExhaustedError,
  type IUnblockerProvider,
} from './unblocker.interface.js';

export class CrawlbaseUnblockerProvider implements IUnblockerProvider {
  public readonly name = 'crawlbase';
  private readonly token: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { token?: string; fetchFn?: typeof fetch } = {}) {
    this.token = options.token ?? env.CRAWLBASE_TOKEN;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  isEnabled(): boolean {
    return Boolean(this.token && this.token.trim().length > 0);
  }

  async fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    if (!this.isEnabled()) {
      throw new UnblockerError(this.name, 'Token is not configured.');
    }

    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? env.PLAYWRIGHT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = new URL('https://api.crawlbase.com/');
      endpoint.searchParams.set('token', this.token.trim());
      endpoint.searchParams.set('url', targetUrl);
      endpoint.searchParams.set('javascript', 'true');

      if (options?.captureScreenshot) {
        endpoint.searchParams.set('screenshot', 'true');
      }

      const response = await this.fetchFn(endpoint.toString(), {
        method: 'GET',
        signal: controller.signal,
      });

      const httpStatus = response.status;
      const rawHtml = await response.text();

      // Crawlbase returns 429 for rate limit or 401/402 when credits depleted, 503 if overloaded
      if (httpStatus === 429 || httpStatus === 402 || httpStatus === 503) {
        throw new UnblockerQuotaExhaustedError(
          this.name,
          `Crawlbase quota depleted, rate-limited, or service unavailable (HTTP ${httpStatus})`,
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
      const screenshotUrl = response.headers.get('screenshot_url');
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
