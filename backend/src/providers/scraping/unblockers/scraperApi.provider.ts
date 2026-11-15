import { resolveTargetCountry } from '../../../utils/geoTarget.js';
import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import { fetchRemoteScreenshot } from '../../../utils/screenshotHelper.js';
import type { ScrapeOptions, ScrapeResult } from '../scraper.interface.js';
import { UnblockerError, UnblockerQuotaExhaustedError } from './unblocker.interface.js';
import { BaseUnblockerProvider } from './baseUnblocker.provider.js';

export class ScraperApiUnblockerProvider extends BaseUnblockerProvider {
  public readonly name = 'scraperapi';
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { apiKey?: string; fetchFn?: typeof fetch } = {}) {
    super();
    this.apiKey = options.apiKey ?? env.SCRAPERAPI_KEY;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  protected async executeAttempt(
    targetUrl: string,
    usePremium: boolean,
    options: ScrapeOptions | undefined,
    signal: AbortSignal,
    startTime: number
  ): Promise<ScrapeResult> {
    signal.throwIfAborted();
    const endpoint = new URL('https://api.scraperapi.com/');
    endpoint.searchParams.set('api_key', this.apiKey.trim());
    endpoint.searchParams.set('url', targetUrl);
    endpoint.searchParams.set('render', 'true');

    if (usePremium) {
      endpoint.searchParams.set('premium', 'true');
      const country = resolveTargetCountry(targetUrl);
      if (country) {
        endpoint.searchParams.set('country_code', country.toLowerCase());
      }
    }

    if (options?.captureScreenshot) {
      endpoint.searchParams.set('screenshot', 'true');
    }

    const response = await this.fetchFn(endpoint.toString(), {
      method: 'GET',
      signal,
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
    const screenshotUrl = response.headers?.get?.('sa-screenshot');
    if (options?.captureScreenshot && screenshotUrl) {
      screenshot = await fetchRemoteScreenshot(screenshotUrl, this.fetchFn, signal);
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
  }
}
