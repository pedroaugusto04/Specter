import { DomainError } from '../../../errors/domainErrors.js';
import type { ScrapeOptions, ScrapeResult } from '../scraper.interface.js';

export class UnblockerError extends DomainError {
  public readonly providerName: string;
  public readonly httpStatus?: number;

  constructor(
    providerName: string,
    message: string,
    httpStatus?: number,
    cause?: unknown,
    code = 'UNBLOCKER_ERROR'
  ) {
    super(`[${providerName}] ${message}`, {
      code,
      statusCode: 502,
      isRetryable: true,
      cause,
    });
    this.providerName = providerName;
    this.httpStatus = httpStatus;
  }
}

/**
 * Thrown when an unblocker service responds with 429, 402, or a quota exhaustion message.
 * Signals to AccessScraperEngine that it should immediately try the next provider.
 */
export class UnblockerQuotaExhaustedError extends UnblockerError {
  constructor(
    providerName: string,
    message = 'Credit limit exhausted or rate-limited',
    httpStatus = 429,
    cause?: unknown
  ) {
    super(providerName, message, httpStatus, cause, 'UNBLOCKER_QUOTA_EXHAUSTED');
  }
}

export interface IUnblockerProvider {
  readonly name: string;

  /**
   * Returns true if this provider is configured with valid credentials in the environment.
   */
  isEnabled(): boolean;

  /**
   * Fetches the target page HTML via the unblocker service.
   * Throws UnblockerQuotaExhaustedError when credits or rate limits are reached.
   */
  fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult>;
}
