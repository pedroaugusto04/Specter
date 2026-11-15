import { describe, expect, it } from 'vitest';
import { parseProxyConfig } from '../../src/utils/proxyParser.js';

describe('Proxy Parser Utility', () => {
  it('returns undefined for empty, whitespace, or undefined input', () => {
    expect(parseProxyConfig(undefined)).toBeUndefined();
    expect(parseProxyConfig('')).toBeUndefined();
    expect(parseProxyConfig('   ')).toBeUndefined();
  });

  it('parses standard proxy URL without credentials', () => {
    const parsed = parseProxyConfig('http://p.webshare.io:80');
    expect(parsed).toEqual({
      server: 'http://p.webshare.io:80',
    });
  });

  it('parses proxy without explicit protocol prefix as http', () => {
    const parsed = parseProxyConfig('p.webshare.io:80');
    expect(parsed).toEqual({
      server: 'http://p.webshare.io:80',
    });
  });

  it('extracts embedded username and password for Playwright Chromium authentication', () => {
    const parsed = parseProxyConfig('http://myuser-rotate:mypassword123@p.webshare.io:80');
    expect(parsed).toEqual({
      server: 'http://p.webshare.io:80',
      username: 'myuser-rotate',
      password: 'mypassword123',
    });
  });

  it('correctly decodes URL-encoded credentials', () => {
    const parsed = parseProxyConfig('http://user%40domain:pass%23word@p.webshare.io:9999');
    expect(parsed).toEqual({
      server: 'http://p.webshare.io:9999',
      username: 'user@domain',
      password: 'pass#word',
    });
  });
});
