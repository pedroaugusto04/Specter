import { AntiBotBlockedError } from '../../../errors/domainErrors.js';
import { isTimeoutError } from '../../../utils/networkErrors.js';
import { UnblockerError } from './unblocker.interface.js';

const ProviderErrorStatus = { Timeout: 504, Internal: 500 } as const;
/** Preserve target-block identity and normalize transport failures consistently. */
export function normalizeUnblockerError(
  provider: string,
  error: unknown,
  timeoutMs: number
): Error {
  if (error instanceof UnblockerError || error instanceof AntiBotBlockedError) return error;
  if (isTimeoutError(error))
    return new UnblockerError(
      provider,
      `Request timed out after ${timeoutMs}ms`,
      ProviderErrorStatus.Timeout,
      error
    );
  return new UnblockerError(
    provider,
    error instanceof Error ? error.message : String(error),
    ProviderErrorStatus.Internal,
    error
  );
}
