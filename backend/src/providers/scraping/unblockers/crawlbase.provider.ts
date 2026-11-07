import { normalizeUnblockerError } from './unblockerErrors.js';
import { resolveTargetCountry } from '../../../utils/geoTarget.js';
import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import { fetchRemoteScreenshot } from '../../../utils/screenshotHelper.js';
import { AntiBotBlockedError } from '../../../errors/domainErrors.js';
import { logger } from '../../../utils/logger.js';
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

  private async executeAttempt(
    targetUrl: string,
    usePremium: boolean,
    options: ScrapeOptions | undefined,
    signal: AbortSignal,
    startTime: number
  ): Promise<ScrapeResult> {
    signal.throwIfAborted();
    const endpoint = new URL('https://api.crawlbase.com/');
    endpoint.searchParams.set('token', this.token.trim());
    endpoint.searchParams.set('url', targetUrl);
    endpoint.searchParams.set('javascript', 'true');
    if (usePremium) {
      endpoint.searchParams.set('residential', 'true');
    }

    const country = resolveTargetCountry(targetUrl);
    if (country) {
      endpoint.searchParams.set('country', country.toUpperCase());
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
    const screenshotUrl = response.headers?.get?.('screenshot_url');
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

  async fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    if (!this.isEnabled()) {
      throw new UnblockerError(this.name, 'Token is not configured.');
    }

    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? env.UNBLOCKER_TIMEOUT_MS;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    try {
      if (options?.premium !== undefined) {
        return await this.executeAttempt(targetUrl, options.premium, options, signal, startTime);
      }

      try {
        return await this.executeAttempt(targetUrl, false, options, signal, startTime);
      } catch (err) {
        if (err instanceof AntiBotBlockedError && !signal.aborted) {
          logger.info(`[${this.name}] Standard proxy challenged by target; retrying with residential proxy...`, {
            targetUrl,
          });
          return await this.executeAttempt(targetUrl, true, options, signal, startTime);
        }
        throw err;
      }
    } catch (err) {
      throw normalizeUnblockerError(this.name, err, timeoutMs);
    }
  }
}
