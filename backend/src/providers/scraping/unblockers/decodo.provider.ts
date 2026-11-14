import { normalizeUnblockerError } from './unblockerErrors.js';
import { resolveTargetCountry } from '../../../utils/geoTarget.js';
import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import { AntiBotBlockedError } from '../../../errors/domainErrors.js';
import { logger } from '../../../utils/logger.js';
import type { ScrapeOptions, ScrapeResult } from '../scraper.interface.js';
import {
  UnblockerError,
  UnblockerQuotaExhaustedError,
  type IUnblockerProvider,
} from './unblocker.interface.js';

interface DecodoScrapeResultItem {
  content?: string | null;
  status_code?: number;
  task_id?: string;
  type?: string;
  headers?: Record<string, string>;
}

interface DecodoScrapeResponse {
  results?: DecodoScrapeResultItem[];
  status?: string;
  message?: string;
}

export class DecodoUnblockerProvider implements IUnblockerProvider {
  public readonly name = 'decodo';
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { apiKey?: string; fetchFn?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? env.DECODO_API_KEY;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private async executeAttempt(
    targetUrl: string,
    usePremium: boolean,
    _options: ScrapeOptions | undefined,
    signal: AbortSignal,
    startTime: number
  ): Promise<ScrapeResult> {
    signal.throwIfAborted();

    const payload: Record<string, unknown> = {
      url: targetUrl,
      headless: 'html',
      proxy_pool: usePremium ? 'premium' : 'standard',
    };

    if (usePremium) {
      const country = resolveTargetCountry(targetUrl);
      if (country) {
        payload.geo = country;
      }
    }

    const response = await this.fetchFn('https://data.decodo.com/v1/scrape', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    const httpStatus = response.status;

    // Check rate limit headers or quota
    if (httpStatus === 429 || httpStatus === 402) {
      throw new UnblockerQuotaExhaustedError(
        this.name,
        `Decodo rate limit reached or quota exhausted (HTTP ${httpStatus})`,
        httpStatus
      );
    }

    let json: DecodoScrapeResponse | null = null;
    let rawText = '';
    try {
      rawText = await response.text();
      json = JSON.parse(rawText) as DecodoScrapeResponse;
    } catch {
      // not JSON
    }

    if (!response.ok) {
      const errorMsg = json?.message || rawText.slice(0, 200) || response.statusText;
      if (
        httpStatus === 401 ||
        httpStatus === 403 ||
        errorMsg.toLowerCase().includes('quota') ||
        errorMsg.toLowerCase().includes('credit') ||
        errorMsg.toLowerCase().includes('limit')
      ) {
        throw new UnblockerQuotaExhaustedError(
          this.name,
          `Decodo authentication or quota error (HTTP ${httpStatus}): ${errorMsg}`,
          httpStatus
        );
      }
      throw new UnblockerError(
        this.name,
        `Request failed with HTTP ${httpStatus}: ${errorMsg}`,
        httpStatus
      );
    }

    const firstResult = json?.results?.[0];
    const destinationStatus = firstResult?.status_code ?? 200;
    const rawHtml = firstResult?.content ?? '';

    // Verify anti-bot block on target content
    detectAntiBotBlock(targetUrl, rawHtml, destinationStatus);

    return {
      rawHtml,
      httpStatus: destinationStatus,
      url: targetUrl,
      durationMs: Date.now() - startTime,
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
          (err.httpStatus === 403 ||
            err.httpStatus === 400 ||
            err.httpStatus === 500 ||
            (typeof err.message === 'string' &&
              (err.message.includes('proxy_pool') || err.message.includes('premium'))));

        if ((isChallenged || isProxyConfigIssue) && !signal.aborted) {
          logger.info(
            `[${this.name}] Standard pool challenged; retrying with premium residential pool...`,
            { targetUrl }
          );
          return await this.executeAttempt(targetUrl, true, options, signal, startTime);
        }
        throw err;
      }
    } catch (err) {
      throw normalizeUnblockerError(this.name, err, timeoutMs);
    }
  }
}
