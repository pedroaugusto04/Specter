import { describe, expect, it } from 'vitest';
import {
  AntiBotBlockedError,
  CompilerApiRequestError,
  UpstreamHttpError,
  DecryptionError,
  ResourceLeaseLostError,
  UnsupportedCapabilityError,
  CompilerTimeoutError,
  CompilerValidationError,
  NavigationTimeoutError,
  SelectorMismatchError,
} from '../src/errors/domainErrors.js';
import { formatUserErrorMessage, presentStoredError } from '../src/utils/errorSanitizer.js';

describe('formatUserErrorMessage (Transparent & User-Friendly Errors)', () => {
  it('formats anti-bot redirect errors without leaking stack traces or query token URLs', () => {
    const rawError = new AntiBotBlockedError(
      'Anti-bot block detected via redirect to security checkpoint: https://www.mercadolivre.com.br/gz/account-verification?go=https%3A%2F%2F...&tid=8e139173-1984-4e91-a33b-818f6e807f24\n    at detectAntiBotBlock (file:///app/dist/utils/antiBotDetector.js:44:19)\n    at PlaywrightScraperEngine.fetchHtml (file:///app/dist/providers/scraping/playwrightScraper.provider.js:101:13)',
      403
    );

    const userFriendly = formatUserErrorMessage(rawError);

    expect(userFriendly).toBe(
      'The website is blocking access right now. Try again later or connect an authenticated session.'
    );
    expect(userFriendly).not.toContain('file:///');
    expect(userFriendly).not.toContain('at detectAntiBotBlock');
    expect(userFriendly).not.toContain('tid=');
  });

  it('formats HTTP 403/429 anti-bot blocks clearly', () => {
    const err403 = new AntiBotBlockedError('Forbidden', 403);
    expect(formatUserErrorMessage(err403)).toBe(
      'The website is blocking access right now. Try again later or connect an authenticated session.'
    );

    const err429 = new AntiBotBlockedError('Too Many Requests', 429);
    expect(formatUserErrorMessage(err429)).toBe(
      'The website is blocking access right now. Try again later or connect an authenticated session.'
    );
  });

  it('formats navigation timeouts, selector mismatches, and compiler errors in clear language', () => {
    expect(formatUserErrorMessage(new NavigationTimeoutError('timeout 30000ms'))).toBe(
      'The website took too long to respond. Please try again later.'
    );
    expect(formatUserErrorMessage(new SelectorMismatchError('selector .price missing'))).toBe(
      'The requested information could not be verified on the page. Check the instructions and try again.'
    );
    expect(formatUserErrorMessage(new CompilerTimeoutError('CLI dead-man switch'))).toBe(
      'Monitor setup took too long to complete. Please try again.'
    );
    expect(formatUserErrorMessage(new CompilerValidationError('Expected selector .price'))).toBe(
      'The requested information could not be verified on the page. Check the instructions and try again.'
    );
  });

  it('strips code stack traces and file paths from generic unhandled errors', () => {
    const genericErr = new Error(
      'Failed to connect to host\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1607:16)\n    at file:///app/dist/server.js:42:15'
    );

    const cleaned = formatUserErrorMessage(genericErr);

    expect(cleaned).toBe('We could not complete this request. Please try again later.');
    expect(cleaned).not.toContain('node:net');
    expect(cleaned).not.toContain('file:///');
  });
});

import { USER_FAILURES, getUserFailure } from '@specter/contracts';
import { ConfigurationFailure } from '../src/extraction/configurationFailure.js';

describe('public failure details', () => {
  it.each([
    [new CompilerApiRequestError(429), USER_FAILURES.compilerRateLimited],
    [
      new CompilerApiRequestError(401, undefined, 'secret provider response'),
      USER_FAILURES.setupUnavailable,
    ],
    [new CompilerApiRequestError(undefined, new Error('timeout')), USER_FAILURES.setupUnavailable],
    [new CompilerTimeoutError('timeout'), USER_FAILURES.setupTimedOut],
    [new UpstreamHttpError(404), USER_FAILURES.websiteUnavailable],
    [new DecryptionError(), USER_FAILURES.sessionUnavailable],
    [new ResourceLeaseLostError(), USER_FAILURES.executionInterrupted],
    [new UnsupportedCapabilityError('internal capability'), USER_FAILURES.unsupported],
    [new ConfigurationFailure('private model response', []), USER_FAILURES.configurationRejected],
  ])('maps %s to approved copy and actionable details', (error, expected) => {
    const message = formatUserErrorMessage(error);
    expect(message).toBe(expected.description);
    expect(getUserFailure(message)).toEqual(expected);
    expect(expected.nextStep.length).toBeGreaterThan(0);
  });

  it('preserves all approved messages at the API boundary', () => {
    for (const failure of Object.values(USER_FAILURES)) {
      expect(presentStoredError(failure.description)).toBe(failure.description);
    }
    expect(presentStoredError(null)).toBeNull();
  });

  it('hides historical internal errors and unrecognized provider messages', () => {
    expect(presentStoredError('Error: password=secret at /app/private.ts:12')).toBe(
      USER_FAILURES.requestFailed.description
    );
    expect(getUserFailure('secret token')).toEqual(USER_FAILURES.requestFailed);
  });

  it('maps stored retry-limit errors to approved public copy', () => {
    expect(presentStoredError('Self-healing retry limit exceeded (3): internal details')).toBe(
      USER_FAILURES.configurationRejected.description
    );
  });
});
