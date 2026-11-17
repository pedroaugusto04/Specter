import { env } from '../config/env.js';

/**
 * Validates whether an incoming HTTP request origin is permitted by the application's CORS policy.
 * Centralized for use by Fastify CORS plugin and hijacked raw HTTP routes (e.g. SSE stream).
 */
export function isAllowedCorsOrigin(
  origin: string | undefined,
  policy: { nodeEnv?: string; corsOrigins?: string; chromeExtensionId?: string } = {}
): boolean {
  const nodeEnv = policy.nodeEnv ?? env.NODE_ENV;
  const corsOrigins = policy.corsOrigins ?? env.CORS_ORIGIN;
  const chromeExtensionId = policy.chromeExtensionId ?? env.CHROME_EXTENSION_ID;
  // Allow requests with no origin (like mobile apps, curl, or server-to-server)
  if (!origin) return true;

  // Chrome extension origin restriction:
  // - In production with CHROME_EXTENSION_ID set, only the specific extension is allowed.
  // - In development or when CHROME_EXTENSION_ID is unset, any chrome-extension:// origin is allowed.
  if (origin.startsWith('chrome-extension://')) {
    const allowedExtId = chromeExtensionId;
    if (!allowedExtId || nodeEnv !== 'production') return true;
    return origin === `chrome-extension://${allowedExtId}`;
  }

  // Production credentialed CORS must use explicit HTTPS origins. Invalid
  // configured values are ignored so a stale HTTP entry cannot widen access.
  const configuredOrigins = corsOrigins.split(',').map((value) => value.trim());
  if (nodeEnv !== 'production' && configuredOrigins.includes('*')) return true;
  const allowedOrigins =
    nodeEnv === 'production'
      ? configuredOrigins.filter((value) => {
          try {
            return new URL(value).protocol === 'https:' && new URL(value).origin === value;
          } catch {
            return false;
          }
        })
      : configuredOrigins;

  if (allowedOrigins.includes(origin)) return true;

  // Local development origins remain convenient without allowing arbitrary
  // HTTP origins from a production configuration.
  if (nodeEnv !== 'production') {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}
