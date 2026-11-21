import { resolveTargetCountry } from '../../../utils/geoTarget.js';
import { env } from '../../../config/env.js';
import { detectAntiBotBlock } from '../../../utils/antiBotDetector.js';
import type { ScrapeOptions, ScrapeResult } from '../scraper.interface.js';
import { UnblockerError, UnblockerQuotaExhaustedError } from './unblocker.interface.js';
import { BaseUnblockerProvider } from './baseUnblocker.provider.js';

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

export class DecodoUnblockerProvider extends BaseUnblockerProvider {
  public readonly name = 'decodo';

  constructor(options: { apiKey?: string; fetchFn?: typeof fetch } = {}) {
    super({
      apiKey: options.apiKey ?? env.DECODO_API_KEY,
      fetchFn: options.fetchFn,
    });
  }

  protected async executeAttempt(
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
}
