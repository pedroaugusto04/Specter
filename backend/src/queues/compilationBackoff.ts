import { env } from '../config/env.js';
import { CompilerApiRequestError } from '../errors/domainErrors.js';

export const COMPILATION_BACKOFF_TYPE = 'compilation';
export function compilationBackoff(
  attemptsMade: number,
  error: Error | undefined,
  rateLimitDelayMs: number
): number {
  if (error instanceof CompilerApiRequestError && error.statusCode === 429)
    return Math.max(rateLimitDelayMs, error.retryAfterMs ?? 0);
  return Math.round(env.SCRAPE_RETRY_DELAY_MS * 2 ** (attemptsMade - 1));
}
