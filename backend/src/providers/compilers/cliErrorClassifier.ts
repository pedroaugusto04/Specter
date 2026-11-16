import {
  CompilerApiRequestError,
  DomainError,
} from '../../errors/domainErrors.js';

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
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof parsed.message === 'string') return parsed.message;
        if (parsed.error && typeof (parsed.error as Record<string, unknown>).message === 'string') {
          return (parsed.error as Record<string, unknown>).message as string;
        }
      } catch {
        // ignore non-json line
      }
    }
  }
  return null;
}

/**
 * Classifies CLI process errors into structured DomainErrors based on exit output and provider rules.
 */
export function defaultCliErrorClassifier(failure: CliProcessFailure): DomainError | null {
  const { providerName, stderr } = failure;
  const trimmedStderr = stderr.trim();

  // Inspect structured JSON error first, falling back to raw output
  const jsonError = extractJsonErrorMessage(trimmedStderr);
  const textToCheck = jsonError || trimmedStderr;

  if (RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(textToCheck))) {
    return new CompilerApiRequestError(
      429,
      textToCheck || `${providerName} rate limit or quota exceeded`,
      textToCheck ? textToCheck.slice(0, 200) : `${providerName} rate limit or quota exceeded`
    );
  }

  if (AUTH_PATTERNS.some((pattern) => pattern.test(textToCheck))) {
    return new CompilerApiRequestError(
      401,
      textToCheck || `${providerName} authentication failed`,
      textToCheck ? textToCheck.slice(0, 200) : `${providerName} authentication failed`
    );
  }

  if (OVERLOAD_PATTERNS.some((pattern) => pattern.test(textToCheck))) {
    return new CompilerApiRequestError(
      503,
      textToCheck || `${providerName} service overloaded or unavailable`,
      textToCheck ? textToCheck.slice(0, 200) : `${providerName} service overloaded`
    );
  }

  return null;
}
