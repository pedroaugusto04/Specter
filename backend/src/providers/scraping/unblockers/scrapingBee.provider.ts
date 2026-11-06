import { normalizeUnblockerError } from './unblockerErrors.js';
import { resolveTargetCountry } from '../../../utils/geoTarget.js';
import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import { decodeBase64Screenshot } from '../../../utils/screenshotHelper.js';
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
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    try {
      signal.throwIfAborted();
      const endpoint = new URL('https://app.scrapingbee.com/api/v1/');
      endpoint.searchParams.set('api_key', this.apiKey.trim());
      endpoint.searchParams.set('url', targetUrl);
      endpoint.searchParams.set('render_js', 'true');
      endpoint.searchParams.set('premium_proxy', 'true');
      endpoint.searchParams.set('block_resources', 'false');
      endpoint.searchParams.set('block_ads', 'true');

      const country = resolveTargetCountry(targetUrl);
      if (country) {
        endpoint.searchParams.set('country_code', country.toLowerCase());
      }

      if (options?.waitForSelector) {
        const cleanWaitSelector = options.waitForSelector.split(',')[0]?.trim();
        if (cleanWaitSelector) {
          endpoint.searchParams.set('wait_for', cleanWaitSelector);
        }
      }

      if (options?.captureScreenshot) {
        endpoint.searchParams.set('screenshot', 'true');
        endpoint.searchParams.set('screenshot_full_page', 'false');
        endpoint.searchParams.set('json_response', 'true');
        endpoint.searchParams.set('wait', '3500');
        endpoint.searchParams.set('window_width', '1366');
        endpoint.searchParams.set('window_height', '768');
        if (options.waitForSelector && !options.waitForSelector.includes(',')) {
          endpoint.searchParams.set('screenshot_selector', options.waitForSelector);
        }
      }

      const response = await this.fetchFn(endpoint.toString(), {
        method: 'GET',
        signal,
      });

      const httpStatus = response.status;
      const rawText = await response.text();

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
        (rawText.toLowerCase().includes('credit') ||
          rawText.toLowerCase().includes('limit') ||
          rawText.toLowerCase().includes('quota') ||
          rawText.toLowerCase().includes('usage'))
      ) {
        throw new UnblockerQuotaExhaustedError(
          this.name,
          `ScrapingBee quota depleted: ${rawText.slice(0, 150)}`,
          httpStatus
        );
      }

      if (!response.ok) {
        throw new UnblockerError(
          this.name,
          `Request failed with HTTP ${httpStatus}: ${rawText.slice(0, 200)}`,
          httpStatus
        );
      }

      let rawHtml = rawText;
      let screenshot: Buffer | undefined;

      if (options?.captureScreenshot) {
        try {
          const parsed = JSON.parse(rawText) as {
            body?: string;
            screenshot?: string;
          };
          if (parsed.body) {
            rawHtml = parsed.body;
          }
          screenshot = decodeBase64Screenshot(parsed.screenshot);
        } catch {
          rawHtml = rawText;
        }
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
      throw normalizeUnblockerError(this.name, err, timeoutMs);
    }
  }
}
