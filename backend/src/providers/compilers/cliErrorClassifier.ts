import { CompilerApiRequestError, DomainError } from '../../errors/domainErrors.js';

export interface CliProcessFailure {
  providerName: string;
  exitCode: number | null;
  stderr: string;
  stdout?: string;
}

export type CliErrorClassifier = (failure: CliProcessFailure) => DomainError | null;

const RATE_LIMIT_PATTERNS = [
  /usage limit/i,
  /rate limit/i,
  /too many requests/i,
  /quota/i,
  /credit/i,
  /insufficient_quota/i,
  /resource_exhausted/i,
];

const AUTH_PATTERNS = [
  /unauthorized/i,
  /authentication/i,
  /invalid_api_key/i,
  /permission_denied/i,
  /not logged in/i,
];

const OVERLOAD_PATTERNS = [
  /overloaded/i,
  /server_error/i,
  /service_unavailable/i,
  /model_unavailable/i,
];

function extractJsonErrorMessage(output: string): string | null {
  if (!output.includes('{')) return null;
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof parsed.message === 'string') return parsed.message;
        if (parsed.error && typeof (parsed.error as Record<string, unknown>).message === 'string') {
          return (parsed.error as Record<string, unknown>).message as string;
        }
      } catch {
        // Ignore non-JSON stderr line
      }
    }
  }
  return null;
}

/**
 * Classifies CLI process errors into structured DomainErrors based on exit output and provider rules.
 */
export function defaultCliErrorClassifier(failure: CliProcessFailure): DomainError | null {
  const trimmedStderr = failure.stderr.trim();
  const textToCheck = extractJsonErrorMessage(trimmedStderr) || trimmedStderr;
  if (!textToCheck) return null;

  const snippet = textToCheck.slice(0, 200);

  if (RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(textToCheck))) {
    return new CompilerApiRequestError(429, undefined, snippet);
  }
  if (AUTH_PATTERNS.some((pattern) => pattern.test(textToCheck))) {
    return new CompilerApiRequestError(401, undefined, snippet);
  }
  if (OVERLOAD_PATTERNS.some((pattern) => pattern.test(textToCheck))) {
    return new CompilerApiRequestError(503, undefined, snippet);
  }

  return null;
}
