import { describe, expect, it } from 'vitest';
import { CompilerApiRequestError } from '../src/errors/domainErrors.js';
import { compilationBackoff } from '../src/queues/compilationBackoff.js';
import { parseRetryAfter, parseRetryInfo } from '../src/utils/retryAfter.js';

describe('Compiler API retry scheduling', () => {
  it('waits at least two minutes for rate limits and respects longer provider delays', () => {
    expect(compilationBackoff(1, new CompilerApiRequestError(429), 120000)).toBe(120000);
    expect(
      compilationBackoff(2, new CompilerApiRequestError(429, undefined, undefined, 180000), 120000)
    ).toBe(180000);
    expect(
      compilationBackoff(1, new CompilerApiRequestError(429, undefined, undefined, 1000), 120000)
    ).toBe(120000);
  });
  it('keeps the existing exponential retry for other failures', () => {
    expect(compilationBackoff(1, new CompilerApiRequestError(503), 120000)).toBe(5000);
    expect(compilationBackoff(2, new Error('failure'), 120000)).toBe(10000);
  });
  it('accepts Retry-After seconds and HTTP dates and ignores malformed values', () => {
    expect(parseRetryAfter('180', 0)).toBe(180000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:03:00 GMT', 0)).toBe(180000);
    expect(parseRetryAfter('invalid', 0)).toBeUndefined();
    expect(
      parseRetryInfo(
        JSON.stringify({
          error: {
            details: [
              { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '180.25s' },
            ],
          },
        })
      )
    ).toBe(180250);
    expect(parseRetryInfo('invalid')).toBeUndefined();
  });
});
