import { parseRetryAfter } from '../../utils/retryAfter.js';
import { isTimeoutError } from '../../utils/networkErrors.js';
import { env } from '../../config/env.js';
import { NavigationTimeoutError } from '../../errors/domainErrors.js';
import { detectAntiBotBlock } from '../../utils/antiBotDetector.js';
import { assertSafeUrl } from '../../utils/ssrfValidator.js';
import { readBoundedResponseText } from '../../utils/responseBody.js';
import type { IScraperEngine, ScrapeOptions, ScrapeResult } from './scraper.interface.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export class CheerioScraperEngine implements IScraperEngine {
  public readonly name = 'cheerio';
  private readonly defaultTimeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly maxResponseBytes: number;

  constructor(
    options: { timeoutMs?: number; fetchFn?: typeof fetch; maxResponseBytes?: number } = {}
  ) {
    this.defaultTimeoutMs = options.timeoutMs ?? env.UNBLOCKER_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
    this.maxResponseBytes = options.maxResponseBytes ?? env.HTTP_MAX_RESPONSE_BYTES;
  }

  async fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const safeTargetUrl = await assertSafeUrl(targetUrl, 'targetUrl');
      const originalOrigin = new URL(safeTargetUrl).origin;
      let currentUrl = safeTargetUrl;
      let response: Response | undefined;
      const signal = options?.signal
        ? AbortSignal.any([controller.signal, options.signal])
        : controller.signal;
      for (let redirect = 0; redirect <= 5; redirect++) {
        const parsed = new URL(await assertSafeUrl(currentUrl, 'requestUrl'));
        if (parsed.origin !== originalOrigin)
          throw new Error('HTTP navigation escaped the original origin.');
        const cookieHeader = options?.storageState?.cookies
          ?.filter((cookie) => {
            const domain = cookie.domain.replace(/^\./, '');
            return (
              (parsed.hostname === domain ||
                (cookie.domain.startsWith('.') && parsed.hostname.endsWith('.' + domain))) &&
              parsed.pathname.startsWith(cookie.path) &&
              (!cookie.secure || parsed.protocol === 'https:') &&
              (cookie.expires < 0 || cookie.expires > Date.now() / 1000)
            );
          })
          .map((cookie) => cookie.name + '=' + cookie.value)
          .join('; ');
        response = await this.fetchFn(parsed.href, {
          method: 'GET',
          redirect: 'manual',
          signal,
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/json',
            'Accept-Language': options?.pageLanguage ?? 'pt-BR',
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          },
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirect === 5) throw new Error('Invalid or excessive HTTP redirects.');
        currentUrl = new URL(location, parsed).href;
      }
      if (!response) throw new Error('HTTP request produced no response.');
      const finalUrl = response.url || currentUrl;
      await assertSafeUrl(finalUrl, 'redirectUrl');
      const httpStatus = response.status;
      const rawHtml = await readBoundedResponseText(response, this.maxResponseBytes);

      // Check HTTP status code, URL redirects, and DOM challenge fingerprints
      detectAntiBotBlock(finalUrl, rawHtml, httpStatus);

      return {
        rawHtml,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
        httpStatus,
        url: finalUrl,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      if (isTimeoutError(err)) {
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
