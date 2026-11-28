import { describe, expect, it } from 'vitest';
import {
  inspectStorageStateExpiry,
  isAuthFailureStatusCode,
} from '../../src/utils/sessionValidator.js';
import type { PlaywrightStorageState } from '../../src/types/session.js';

describe('sessionValidator', () => {
  describe('inspectStorageStateExpiry', () => {
    it('detects when all cookies for the target host are expired', () => {
      const nowSec = 1700000000;
      const nowMs = nowSec * 1000;
      const state: PlaywrightStorageState = {
        cookies: [
          {
            name: 'session_id',
            value: 'xyz',
            domain: '.feconnect.com.br',
            path: '/',
            expires: nowSec - 3600, // 1 hour ago
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
          },
          {
            name: 'token',
            value: 'abc',
            domain: 'app.feconnect.com.br',
            path: '/',
            expires: nowSec - 60, // 1 min ago
            httpOnly: false,
            secure: true,
            sameSite: 'Strict',
          },
        ],
        origins: [],
      };

      const result = inspectStorageStateExpiry(state, 'https://app.feconnect.com.br/home', nowMs);
      expect(result.isExpired).toBe(true);
      expect(result.reason).toBe('COOKIES_EXPIRED');
    });

    it('returns not expired when at least one cookie is still valid', () => {
      const nowSec = 1700000000;
      const nowMs = nowSec * 1000;
      const state: PlaywrightStorageState = {
        cookies: [
          {
            name: 'expired_cookie',
            value: 'xyz',
            domain: 'app.feconnect.com.br',
            path: '/',
            expires: nowSec - 3600,
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
          },
          {
            name: 'valid_cookie',
            value: 'abc',
            domain: 'app.feconnect.com.br',
            path: '/',
            expires: nowSec + 3600, // in the future
            httpOnly: false,
            secure: true,
            sameSite: 'Strict',
          },
        ],
        origins: [],
      };

      const result = inspectStorageStateExpiry(state, 'https://app.feconnect.com.br/home', nowMs);
      expect(result.isExpired).toBe(false);
    });

    it('ignores cookies belonging to completely different domains', () => {
      const nowSec = 1700000000;
      const nowMs = nowSec * 1000;
      const state: PlaywrightStorageState = {
        cookies: [
          {
            name: 'other_session',
            value: 'xyz',
            domain: 'other-site.com',
            path: '/',
            expires: nowSec - 3600,
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      };

      const result = inspectStorageStateExpiry(state, 'https://app.feconnect.com.br/home', nowMs);
      expect(result.isExpired).toBe(false);
    });

    it('detects expired JWT token in localStorage', () => {
      const nowSec = 1700000000;
      const nowMs = nowSec * 1000;
      const expiredPayload = Buffer.from(
        JSON.stringify({ sub: 'user_1', exp: nowSec - 300 })
      ).toString('base64');
      const expiredJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${expiredPayload}.dummySignature`;

      const state: PlaywrightStorageState = {
        cookies: [],
        origins: [
          {
            origin: 'https://app.feconnect.com.br',
            localStorage: [
              {
                name: 'sb-auth-token',
                value: expiredJwt,
              },
            ],
          },
        ],
      };

      const result = inspectStorageStateExpiry(state, 'https://app.feconnect.com.br/home', nowMs);
      expect(result.isExpired).toBe(true);
      expect(result.reason).toBe('JWT_EXPIRED');
    });

    it('detects expired JWT token inside cookie value even if cookie has future expiry or session cookie', () => {
      const nowSec = 1700000000;
      const nowMs = nowSec * 1000;
      const expiredPayload = Buffer.from(
        JSON.stringify({ sub: 'user_1', exp: nowSec - 300 })
      ).toString('base64');
      const expiredJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${expiredPayload}.dummySignature`;

      const state: PlaywrightStorageState = {
        cookies: [
          {
            name: 'next-auth.session-token',
            value: expiredJwt,
            domain: 'app.feconnect.com.br',
            path: '/',
            expires: nowSec + 86400 * 30, // cookie header says 30 days in future
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      };

      const result = inspectStorageStateExpiry(state, 'https://app.feconnect.com.br/home', nowMs);
      expect(result.isExpired).toBe(true);
      expect(result.reason).toBe('JWT_EXPIRED');
      expect(result.detail).toContain('next-auth.session-token');
    });

    it('detects URL-encoded expired JWT token inside cookie value', () => {
      const nowSec = 1700000000;
      const nowMs = nowSec * 1000;
      const expiredPayload = Buffer.from(
        JSON.stringify({ sub: 'user_1', exp: nowSec - 300 })
      ).toString('base64');
      const expiredJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${expiredPayload}.dummySignature`;

      const state: PlaywrightStorageState = {
        cookies: [
          {
            name: 'encoded_jwt_cookie',
            value: encodeURIComponent(expiredJwt),
            domain: 'app.feconnect.com.br',
            path: '/',
            expires: -1, // session cookie
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      };

      const result = inspectStorageStateExpiry(state, 'https://app.feconnect.com.br/home', nowMs);
      expect(result.isExpired).toBe(true);
      expect(result.reason).toBe('JWT_EXPIRED');
    });
  });

  describe('isAuthFailureStatusCode', () => {
    it('identifies 401 and 403 as auth failures', () => {
      expect(isAuthFailureStatusCode(401)).toBe(true);
      expect(isAuthFailureStatusCode(403)).toBe(true);
      expect(isAuthFailureStatusCode(200)).toBe(false);
      expect(isAuthFailureStatusCode(404)).toBe(false);
      expect(isAuthFailureStatusCode(500)).toBe(false);
      expect(isAuthFailureStatusCode(null)).toBe(false);
    });
  });
});
