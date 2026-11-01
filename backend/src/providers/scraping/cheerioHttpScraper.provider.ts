import { env } from '../../config/env.js';
import { AntiBotBlockedError, NavigationTimeoutError } from '../../errors/domainErrors.js';
import type { IScraperEngine, ScrapeOptions, ScrapeResult } from './scraper.interface.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export class CheerioScraperEngine implements IScraperEngine {
  public readonly name = 'cheerio';
  private readonly defaultTimeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: { timeoutMs?: number; fetchFn?: typeof fetch } = {}) {
    this.defaultTimeoutMs = options.timeoutMs ?? env.PLAYWRIGHT_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetchFn(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      const httpStatus = response.status;
      if (httpStatus === 403 || httpStatus === 429) {
        throw new AntiBotBlockedError(
          `Bloqueio anti-bot detectado com HTTP status ${httpStatus} em ${targetUrl}`,
          httpStatus
        );
      }

      const rawHtml = await response.text();
      return {
        rawHtml,
        httpStatus,
        url: response.url || targetUrl,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      if (err instanceof AntiBotBlockedError) {
        throw err;
      }
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('timeout'))) {
        throw new NavigationTimeoutError(
          `HTTP request timed out after ${timeoutMs}ms for URL: ${targetUrl}`,
          err
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
