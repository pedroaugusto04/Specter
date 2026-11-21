import { AntiBotBlockedError } from '../../../errors/domainErrors.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import type { ScrapeOptions, ScrapeResult } from '../scraper.interface.js';
import { UnblockerError, type IUnblockerProvider } from './unblocker.interface.js';
import { normalizeUnblockerError } from './unblockerErrors.js';

export abstract class BaseUnblockerProvider implements IUnblockerProvider {
  abstract readonly name: string;
  protected readonly apiKey: string;
  protected readonly fetchFn: typeof fetch;

  constructor(options: { apiKey?: string; token?: string; fetchFn?: typeof fetch } = {}) {
    this.apiKey = (options.apiKey ?? options.token ?? '').trim();
    this.fetchFn = options.fetchFn ?? fetch;
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  protected abstract executeAttempt(
    targetUrl: string,
    usePremium: boolean,
    options: ScrapeOptions | undefined,
    signal: AbortSignal,
    startTime: number
  ): Promise<ScrapeResult>;

  protected shouldEscalateToPremium(err: unknown): boolean {
    if (err instanceof AntiBotBlockedError) {
      return true;
    }

    if (err instanceof UnblockerError) {
      if (
        err.httpStatus === 400 ||
        err.httpStatus === 403 ||
        err.httpStatus === 422 ||
        err.httpStatus === 500
      ) {
        return true;
      }

      const msg = err.message.toLowerCase();
      return (
        msg.includes('country') ||
        msg.includes('premium') ||
        msg.includes('residential') ||
        msg.includes('proxy_pool')
      );
    }

    return false;
  }

  async fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    if (!this.isEnabled()) {
      throw new UnblockerError(this.name, 'API key or token is not configured.');
    }

    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? env.UNBLOCKER_TIMEOUT_MS;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout;

    try {
      signal.throwIfAborted();

      if (options?.premium !== undefined) {
        return await this.executeAttempt(targetUrl, options.premium, options, signal, startTime);
      }

      try {
        return await this.executeAttempt(targetUrl, false, options, signal, startTime);
      } catch (err) {
        if (!signal.aborted && this.shouldEscalateToPremium(err)) {
          logger.info(
            `[${this.name}] Standard unblocker run failed or challenged for ${targetUrl}. Escalating to premium...`
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
