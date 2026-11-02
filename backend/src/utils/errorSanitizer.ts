import {
  AntiBotBlockedError,
  CompilerTimeoutError,
  CompilerValidationError,
  DomainError,
  NavigationTimeoutError,
  SelectorMismatchError,
} from '../errors/domainErrors.js';

/**
 * Transforms an internal error or exception into a clean, human-readable,
 * user-facing message free of code stack traces, internal file paths, or raw token leaks.
 */
export function formatUserErrorMessage(error: unknown): string {
  if (error instanceof AntiBotBlockedError) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('redirect') ||
      msg.includes('redirecionamento') ||
      msg.includes('account-verification') ||
      msg.includes('checkpoint')
    ) {
      return 'Anti-bot block detected: target website redirected to a security checkpoint or CAPTCHA verification screen.';
    }
    if (error.httpStatus === 403 || error.httpStatus === 429) {
      return `Anti-bot block detected: target website refused access (HTTP ${error.httpStatus}).`;
    }
    return 'Anti-bot block detected: page presented an automated security challenge (Cloudflare / CAPTCHA).';
  }

  if (error instanceof NavigationTimeoutError) {
    return 'Navigation timeout: target website took too long to respond.';
  }

  if (error instanceof SelectorMismatchError) {
    return 'Selector mismatch: requested data could not be found on page (site layout may have changed).';
  }

  if (error instanceof CompilerTimeoutError) {
    return 'Compilation timeout exceeded by AI extractor agent.';
  }

  if (error instanceof CompilerValidationError) {
    const rawReason = error.message ? error.message.replace(/^[A-Za-z0-9_]+Error:\s*/, '') : '';
    return `Extractor validation failed (smoke test): ${rawReason || 'compiled selectors returned no valid data.'}`;
  }

  if (error instanceof DomainError) {
    return error.message;
  }

  const rawMessage = error instanceof Error ? error.message : String(error);

  // Take only the first line to discard any attached stack traces
  const firstLine = rawMessage.split('\n')[0]?.trim() || 'Error during execution.';

  // Strip error class names e.g. "Error: ", "BotBlockedError: ", "AntiBotBlockedError: "
  const cleaned = firstLine
    .replace(/^[A-Za-z0-9_]+Error:\s*/, '')
    // Strip file:// paths or internal paths
    .replace(/\(?file:\/\/\/[^)]*\)?/g, '')
    .replace(/\/app\/[^\s)]*/g, '')
    .replace(/[A-Za-z]:\\[^\s)]*/g, '')
    .trim();

  return cleaned || 'Unexpected error occurred during processing.';
}
