import { describe, expect, it } from 'vitest';
import { resolveTargetCountry } from '../../src/utils/geoTarget.js';
import { buildChromeFingerprint } from '../../src/utils/chromeFingerprint.js';

describe('resolveTargetCountry', () => {
  it.each([
    ['https://www.mercadolivre.com.br/p/MLB1', 'BR'],
    ['https://www.mercadolibre.com.ar/x', 'AR'],
    ['https://www.amazon.co.uk/dp/1', 'GB'],
    ['https://www.zalando.de/', 'DE'],
  ])('infers the audience country of %s', (url, country) => {
    expect(resolveTargetCountry(url)).toBe(country);
  });

  it.each(['https://example.com/', 'https://example.io/', 'https://example.tv/', 'not a url'])(
    'returns no country for generic or invalid target %s',
    (url) => {
      expect(resolveTargetCountry(url)).toBeUndefined();
    }
  );
});

describe('buildChromeFingerprint', () => {
  it('keeps user agent and client hints on the real browser major version', () => {
    const fingerprint = buildChromeFingerprint('141.0.7390.37');
    expect(fingerprint.userAgent).toContain('Chrome/141.0.0.0');
    expect(fingerprint.secChUa).toContain('v="141"');
  });
});
