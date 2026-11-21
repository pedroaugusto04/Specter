import { resolveTargetCountry } from '../../../utils/geoTarget.js';
import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import { decodeBase64Screenshot } from '../../../utils/screenshotHelper.js';
import type { ScrapeOptions, ScrapeResult } from '../scraper.interface.js';
import { UnblockerError, UnblockerQuotaExhaustedError } from './unblocker.interface.js';
import { BaseUnblockerProvider } from './baseUnblocker.provider.js';

export class ZenRowsUnblockerProvider extends BaseUnblockerProvider {
  public readonly name = 'zenrows';

  constructor(options: { apiKey?: string; fetchFn?: typeof fetch } = {}) {
    super({
      apiKey: options.apiKey ?? env.ZENROWS_API_KEY,
      fetchFn: options.fetchFn,
    });
  }

  protected async executeAttempt(
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
}
