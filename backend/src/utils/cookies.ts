export const ACCESS_COOKIE_NAME = 'specter_access';
export const REFRESH_COOKIE_NAME = 'specter_refresh';
export const OAUTH_STATE_COOKIE_NAME = 'specter_oauth_state';

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
  maxAge?: number;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const rawVal = pair.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  segments.push(`Path=${options.path ?? '/'}`);

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${Math.floor(options.maxAge)}`);
    if (options.maxAge <= 0) {
      segments.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    }
  }

  if (options.httpOnly !== false) {
    segments.push('HttpOnly');
  }

  if (options.secure) {
    segments.push('Secure');
  }

  segments.push(`SameSite=${options.sameSite ?? 'Lax'}`);

  return segments.join('; ');
}
