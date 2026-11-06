/** Parse HTTP Retry-After as seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed) * 1000;
    return Number.isSafeInteger(ms) ? ms : undefined;
  }
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : undefined;
}

/** Read the standard Google RetryInfo duration when present in an API error body. */
export function parseRetryInfo(body: string): number | undefined {
  try {
    const parsed = JSON.parse(body) as {
      error?: { details?: Array<{ '@type'?: unknown; retryDelay?: unknown }> };
    };
    for (const item of parsed.error?.details ?? []) {
      if (
        item['@type'] !== 'type.googleapis.com/google.rpc.RetryInfo' ||
        typeof item.retryDelay !== 'string'
      )
        continue;
      const match = /^(\d+(?:\.\d+)?)s$/.exec(item.retryDelay);
      if (!match) continue;
      const ms = Math.ceil(Number(match[1]) * 1000);
      if (Number.isSafeInteger(ms)) return ms;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
