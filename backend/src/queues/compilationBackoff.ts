import { CompilerApiRequestError } from '../errors/domainErrors.js';

export const COMPILATION_BACKOFF_TYPE = 'compilation';
export function compilationBackoff(
  attemptsMade: number,
  error: Error | undefined,
  rateLimitDelayMs: number
): number {
  if (error instanceof CompilerApiRequestError && error.statusCode === 429)
    return Math.max(rateLimitDelayMs, error.retryAfterMs ?? 0);
  return Math.round(5000 * 2 ** (attemptsMade - 1));
}
