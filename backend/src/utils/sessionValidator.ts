import type { PlaywrightStorageState } from '../types/session.js';

export interface SessionExpiryInspection {
  isExpired: boolean;
  reason?: 'COOKIES_EXPIRED' | 'JWT_EXPIRED' | 'AUTH_STATUS_CODE';
  detail?: string;
}

function parseHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function domainMatches(cookieDomain: string, targetHost: string): boolean {
  const normalizedCookieDomain = cookieDomain.startsWith('.')
    ? cookieDomain.slice(1).toLowerCase()
    : cookieDomain.toLowerCase();
  const normalizedTargetHost = targetHost.toLowerCase();
  return (
    normalizedTargetHost === normalizedCookieDomain ||
    normalizedTargetHost.endsWith('.' + normalizedCookieDomain)
  );
}

function decodeJwtExpMs(rawValue: string): number | null {
  let token = rawValue;
  if (!token.startsWith('ey') && token.includes('%')) {
    try {
      token = decodeURIComponent(token);
    } catch {
      // Keep original
    }
  }

  if (!token.startsWith('ey') || !token.includes('.')) return null;

  const parts = token.split('.');
  const b64Payload = parts[1];
  if (parts.length !== 3 || !b64Payload) return null;

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function inspectExpiredCookies(
  cookies: PlaywrightStorageState['cookies'],
  targetHost: string,
  nowMs: number
): SessionExpiryInspection | null {
  const relevantCookies = (cookies ?? []).filter((cookie) =>
    domainMatches(cookie.domain, targetHost)
  );
  if (relevantCookies.length === 0) return null;

  // 1. Check if any cookie value itself contains an expired JWT token (e.g. NextAuth, Supabase, Auth0)
  for (const cookie of relevantCookies) {
    const expMs = cookie.value ? decodeJwtExpMs(cookie.value) : null;
    if (expMs !== null && expMs <= nowMs) {
      return {
        isExpired: true,
        reason: 'JWT_EXPIRED',
        detail: `Auth token in cookie (${cookie.name}) expired at ${new Date(expMs).toISOString()}.`,
      };
    }
  }

  // 2. Check if all cookies with expiry timestamps are in the past (RFC 6265)
  const cookiesWithExpiry = relevantCookies.filter((cookie) => cookie.expires > 0);
  const expiredCookies = cookiesWithExpiry.filter((cookie) => cookie.expires * 1000 <= nowMs);

  if (cookiesWithExpiry.length > 0 && expiredCookies.length === relevantCookies.length) {
    return {
      isExpired: true,
      reason: 'COOKIES_EXPIRED',
      detail: `All ${relevantCookies.length} session cookies for ${targetHost} expired.`,
    };
  }

  return null;
}

function inspectExpiredJwtTokens(
  origins: PlaywrightStorageState['origins'],
  targetHost: string,
  nowMs: number
): SessionExpiryInspection | null {
  for (const originEntry of origins ?? []) {
    const originHost = parseHostname(originEntry.origin);
    if (!originHost) continue;
    if (!domainMatches(originHost, targetHost) && !domainMatches(targetHost, originHost)) {
      continue;
    }

    for (const item of originEntry.localStorage ?? []) {
      const expMs = item.value ? decodeJwtExpMs(item.value) : null;
      if (expMs !== null && expMs <= nowMs) {
        return {
          isExpired: true,
          reason: 'JWT_EXPIRED',
          detail: `Auth token in localStorage (${item.name}) expired at ${new Date(expMs).toISOString()}.`,
        };
      }
    }
  }

  return null;
}

/**
 * 100% deterministic check of cookie expiration timestamps (RFC 6265)
 * and JWT exp claims (RFC 7519) in localStorage.
 * Runs before browser launch to avoid wasting resources on guaranteed-dead sessions.
 */
export function inspectStorageStateExpiry(
  storageState: PlaywrightStorageState,
  targetUrl: string,
  nowMs = Date.now()
): SessionExpiryInspection {
  const targetHost = parseHostname(targetUrl);
  if (!targetHost) return { isExpired: false };

  return (
    inspectExpiredCookies(storageState.cookies, targetHost, nowMs) ??
    inspectExpiredJwtTokens(storageState.origins, targetHost, nowMs) ?? { isExpired: false }
  );
}

/**
 * Deterministic check if HTTP status represents authentication/authorization rejection (RFC 7235).
 */
export function isAuthFailureStatusCode(statusCode?: number | null): boolean {
  return statusCode === 401 || statusCode === 403;
}
