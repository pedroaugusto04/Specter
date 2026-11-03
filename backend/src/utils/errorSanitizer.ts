import {
  AntiBotBlockedError,
  CompilerTimeoutError,
  CompilerValidationError,
  DomainError,
  NavigationTimeoutError,
  SelectorMismatchError,
} from '../errors/domainErrors.js';

const USER_ERROR_MESSAGES = {
  accessBlocked:
    'The website is blocking access right now. Try again later or connect an authenticated session.',
  requestTimedOut: 'The website took too long to respond. Please try again later.',
  requestedDataUnavailable:
    'The requested information could not be verified on the page. Check the instructions and try again.',
  setupTimedOut: 'Monitor setup took too long to complete. Please try again.',
  requestFailed: 'We could not complete this request. Please try again later.',
} as const;

/** Maps internal exceptions to short user-facing messages without exposing technical details. */
export function formatUserErrorMessage(error: unknown): string {
  if (error instanceof AntiBotBlockedError) return USER_ERROR_MESSAGES.accessBlocked;
  if (error instanceof NavigationTimeoutError) return USER_ERROR_MESSAGES.requestTimedOut;
  if (error instanceof SelectorMismatchError || error instanceof CompilerValidationError)
    return USER_ERROR_MESSAGES.requestedDataUnavailable;
  if (error instanceof CompilerTimeoutError) return USER_ERROR_MESSAGES.setupTimedOut;
  if (error instanceof DomainError) return USER_ERROR_MESSAGES.requestFailed;
  return USER_ERROR_MESSAGES.requestFailed;
}
