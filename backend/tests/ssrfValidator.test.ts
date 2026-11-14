import { describe, expect, it } from 'vitest';
import { assertSafeUrl, isInternalHostname, isPrivateIp } from '../src/utils/ssrfValidator.js';

describe('SSRF Protection & URL Validation (ssrfValidator)', () => {
  describe('isPrivateIp', () => {
    it('detects IPv4 loopback, current network, and RFC 1918 private ranges', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('127.1.2.3')).toBe(true);
      expect(isPrivateIp('0.0.0.0')).toBe(true);
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('10.254.1.1')).toBe(true);
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.31.255.254')).toBe(true);
      expect(isPrivateIp('192.168.1.1')).toBe(true);
      expect(isPrivateIp('192.168.0.254')).toBe(true);
    });

    it('detects cloud metadata and link-local IP addresses (169.254.x.x)', () => {
      expect(isPrivateIp('169.254.169.254')).toBe(true);
      expect(isPrivateIp('169.254.0.1')).toBe(true);
    });

    it('detects multicast and reserved experimental ranges', () => {
      expect(isPrivateIp('224.0.0.1')).toBe(true);
      expect(isPrivateIp('240.0.0.1')).toBe(true);
      expect(isPrivateIp('255.255.255.255')).toBe(true);
    });

    it('detects IPv6 loopback, link-local, and unique-local addresses', () => {
      expect(isPrivateIp('::1')).toBe(true);
      expect(isPrivateIp('::')).toBe(true);
      expect(isPrivateIp('fe80::1')).toBe(true);
      expect(isPrivateIp('fc00::1')).toBe(true);
      expect(isPrivateIp('fd12:3456::1')).toBe(true);
      expect(isPrivateIp('ff02::1')).toBe(true);
    });

    it('detects IPv4-mapped IPv6 loopback and private addresses', () => {
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
    });

    it('detects reserved documentation and protocol assignment blocks (RFC 6890 / 5735)', () => {
      expect(isPrivateIp('192.0.0.1')).toBe(true);
      expect(isPrivateIp('192.0.2.1')).toBe(true);
      expect(isPrivateIp('198.51.100.1')).toBe(true);
      expect(isPrivateIp('203.0.113.1')).toBe(true);
    });

    it('allows valid public IPv4 and IPv6 addresses', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('1.1.1.1')).toBe(false);
      expect(isPrivateIp('93.184.216.34')).toBe(false);
      expect(isPrivateIp('192.0.66.204')).toBe(false); // Automattic / WordPress VIP public block
      expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
    });
  });

  describe('isInternalHostname', () => {
    it('blocks known local/container hostnames and extensions', () => {
      expect(isInternalHostname('localhost')).toBe(true);
      expect(isInternalHostname('redis')).toBe(true);
      expect(isInternalHostname('postgres')).toBe(true);
      expect(isInternalHostname('backend')).toBe(true);
      expect(isInternalHostname('frontend')).toBe(true);
      expect(isInternalHostname('database')).toBe(true);
      expect(isInternalHostname('app.local')).toBe(true);
      expect(isInternalHostname('service.internal')).toBe(true);
      expect(isInternalHostname('mycorp.lan')).toBe(true);
      expect(isInternalHostname('test.localhost')).toBe(true);
    });

    it('blocks single-word hostnames (no dots)', () => {
      expect(isInternalHostname('internal-server')).toBe(true);
      expect(isInternalHostname('api-gateway')).toBe(true);
    });

    it('allows valid external FQDN domains', () => {
      expect(isInternalHostname('example.com')).toBe(false);
      expect(isInternalHostname('api.github.com')).toBe(false);
      expect(isInternalHostname('store.mercadolivre.com.br')).toBe(false);
    });
  });

  describe('assertSafeUrl', () => {
    it('rejects URLs pointing to localhost and internal hostnames', async () => {
      await expect(assertSafeUrl('http://localhost:3000')).rejects.toThrow(/forbidden/i);
      await expect(assertSafeUrl('http://redis:6379')).rejects.toThrow(/forbidden/i);
      await expect(assertSafeUrl('http://postgres:5432')).rejects.toThrow(/forbidden/i);
      await expect(assertSafeUrl('http://service.local/api')).rejects.toThrow(/forbidden/i);
    });

    it('rejects URLs pointing to loopback, private, and AWS metadata IPs', async () => {
      await expect(assertSafeUrl('http://127.0.0.1:8080')).rejects.toThrow(/forbidden/i);
      await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
        /forbidden/i
      );
      await expect(assertSafeUrl('http://10.0.0.5/admin')).rejects.toThrow(/forbidden/i);
      await expect(assertSafeUrl('http://192.168.1.100')).rejects.toThrow(/forbidden/i);
      await expect(assertSafeUrl('http://[::1]:3000')).rejects.toThrow(/forbidden/i);
    });

    it('rejects non-HTTP protocols (e.g. file://, ftp://, gopher://)', async () => {
      await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(/Only HTTP and HTTPS/i);
      await expect(assertSafeUrl('ftp://ftp.example.com')).rejects.toThrow(/Only HTTP and HTTPS/i);
      await expect(assertSafeUrl('gopher://127.0.0.1')).rejects.toThrow(/Only HTTP and HTTPS/i);
    });

    it('allows valid public URLs', async () => {
      const safe = await assertSafeUrl('https://example.com/test?param=1#fragment');
      expect(safe).toBe('https://example.com/test?param=1');
    });
  });
});
