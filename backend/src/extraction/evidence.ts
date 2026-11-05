import type { Scalar } from './contracts.js';
/** Limit persisted/model-visible evidence; never include request headers or session state. */
export function redactText(value: string, limit = 2048): string {
  return value
    .replace(
      /([?&](?:token|key|secret|session_id|access_token|api_key|apikey|password|refresh_token)=)[^&#\s"']*/gi,
      '$1[REDACTED]'
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/Bearer\s+[a-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .slice(0, limit);
}

export function evidenceValue(value: unknown): Scalar {
  return typeof value === 'string'
    ? redactText(value)
    : typeof value === 'number' || typeof value === 'boolean'
      ? value
      : null;
}

export function redactObject(value: unknown, depth = 0, stringLimit = 8000): unknown {
  if (depth > 16) return '[DEPTH LIMIT]';
  if (typeof value === 'string') return redactText(value, stringLimit);
  if (Array.isArray(value))
    return value.slice(0, 500).map((item) => redactObject(item, depth + 1, stringLimit));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 200)
      .map(([key, item]) => [
        key,
        /^(?:authorization|cookie|set-cookie|password|token|access_token|refresh_token|secret|api_key)$/i.test(
          key
        )
          ? '[REDACTED]'
          : redactObject(item, depth + 1, stringLimit),
      ])
  );
}
