import { normalizeUnblockerError } from './unblockerErrors.js';
import { resolveTargetCountry } from '../../../utils/geoTarget.js';
import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import { decodeBase64Screenshot } from '../../../utils/screenshotHelper.js';
import { AntiBotBlockedError } from '../../../errors/domainErrors.js';
import { logger } from '../../../utils/logger.js';
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

  private async executeAttempt(
    targetUrl: string,
    usePremium: boolean,
    options: ScrapeOptions | undefined,
    signal: AbortSignal,
    startTime: number
  ): Promise<ScrapeResult> {
    signal.throwIfAborted();
    const endpoint = new URL('https://api.zenrows.com/v1/');
    endpoint.searchParams.set('apikey', this.apiKey.trim());
    endpoint.searchParams.set('url', targetUrl);
    endpoint.searchParams.set('js_render', 'true');
    if (usePremium) {
      endpoint.searchParams.set('premium_proxy', 'true');
      const country = resolveTargetCountry(targetUrl);
      if (country) {
        endpoint.searchParams.set('proxy_country', country.toLowerCase());
      }
    }

    if (options?.waitForSelector) {
      const cleanWaitSelector = options.waitForSelector.split(',')[0]?.trim();
      if (cleanWaitSelector) {
        endpoint.searchParams.set('wait_for', cleanWaitSelector);
      }
    }

    if (options?.captureScreenshot) {
      endpoint.searchParams.set('screenshot', 'true');
      endpoint.searchParams.set('screenshot_format', 'jpeg');
      endpoint.searchParams.set('screenshot_quality', '80');
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

    // Check for rate limit or exhausted quota
    if (httpStatus === 429 || httpStatus === 402) {
      throw new UnblockerQuotaExhaustedError(
        this.name,
        `ZenRows quota exhausted or rate limit hit (HTTP ${httpStatus})`,
        httpStatus
      );
    }

    if (rawText.includes('PAYMENT_REQUIRED') || rawText.includes('QUOTA_EXCEEDED')) {
      throw new UnblockerQuotaExhaustedError(
        this.name,
        'ZenRows response indicated quota exceeded or payment required',
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
          html?: string;
          screenshot?: { data?: string } | string;
        };
        if (parsed.html) {
          rawHtml = parsed.html;
        }
        const base64Str =
          typeof parsed.screenshot === 'string' ? parsed.screenshot : parsed.screenshot?.data;
        screenshot = decodeBase64Screenshot(base64Str);
      } catch {
        // If JSON parse fails, fallback to rawText as HTML without screenshot
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
  }

  async fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    if (!this.isEnabled()) {
      throw new UnblockerError(this.name, 'API key is not configured.');
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
        const isChallenged = err instanceof AntiBotBlockedError;
        const isProxyConfigIssue =
          err instanceof UnblockerError &&
          (err.statusCode === 422 ||
            err.statusCode === 400 ||
            (typeof err.message === 'string' &&
              (err.message.includes('proxy_country') ||
                err.message.includes('premium') ||
                err.message.includes('RESP001'))));

        if ((isChallenged || isProxyConfigIssue) && !signal.aborted) {
          logger.info(`[${this.name}] Standard proxy challenged or requires premium proxy; retrying with premium proxy...`, {
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
