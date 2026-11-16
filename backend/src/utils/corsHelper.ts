import { env } from '../config/env.js';

/**
 * Validates whether an incoming HTTP request origin is permitted by the application's CORS policy.
 * Centralized for use by Fastify CORS plugin and hijacked raw HTTP routes (e.g. SSE stream).
 */
export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  // Allow requests with no origin (like mobile apps, curl, or server-to-server)
  if (!origin) return true;

  // Chrome extension origin restriction:
  // - In production with CHROME_EXTENSION_ID set, only the specific extension is allowed.
  // - In development or when CHROME_EXTENSION_ID is unset, any chrome-extension:// origin is allowed.
  if (origin.startsWith('chrome-extension://')) {
    const allowedExtId = env.CHROME_EXTENSION_ID;
    if (!allowedExtId || env.NODE_ENV !== 'production') return true;
    return origin === `chrome-extension://${allowedExtId}`;
  }

  // Check configured CORS origins
  const allowed =
    env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim());
  if (allowed === true || allowed.includes(origin)) return true;

  return false;
}
