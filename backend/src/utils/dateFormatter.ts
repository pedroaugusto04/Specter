export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Validates and normalizes an IANA timezone identifier, falling back to America/Sao_Paulo.
 */
export function resolveTimezone(tz?: string | null): string {
  if (!tz || typeof tz !== 'string') return DEFAULT_TIMEZONE;
  const trimmed = tz.trim();
  if (!trimmed) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Formats a Date/string for human-readable notification displays (e.g. Telegram alerts and test messages),
 * using the provided timezone with automatic fallback to America/Sao_Paulo.
 */
export function formatNotificationDateTime(
  date: Date | string | undefined | null,
  timeZone?: string | null,
  options: { includeTzSuffix?: boolean } = { includeTzSuffix: true }
): string {
  const d = date ? (date instanceof Date ? date : new Date(date)) : new Date();
  if (Number.isNaN(d.getTime())) return String(date ?? '—');

  const tz = resolveTimezone(timeZone);
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: tz,
    }).format(d);
    return options.includeTzSuffix ? `${formatted} (${tz})` : formatted;
  } catch {
    return d.toISOString();
  }
}

/**
 * Formats a Date/string for transactional email alerts,
 * using the provided timezone with automatic fallback to America/Sao_Paulo.
 */
export function formatEmailDateTime(
  date: Date | string | undefined | null,
  timeZone?: string | null
): string {
  const d = date ? (date instanceof Date ? date : new Date(date)) : new Date();
  if (Number.isNaN(d.getTime())) return String(date ?? '—');

  const tz = resolveTimezone(timeZone);
  try {
    return (
      new Intl.DateTimeFormat('en-US', {
        dateStyle: 'long',
        timeStyle: 'medium',
        timeZone: tz,
      }).format(d) + ` (${tz})`
    );
  } catch {
    try {
      return (
        new Intl.DateTimeFormat('en-US', {
          dateStyle: 'long',
          timeStyle: 'medium',
          timeZone: DEFAULT_TIMEZONE,
        }).format(d) + ` (${DEFAULT_TIMEZONE})`
      );
    } catch {
      return d.toISOString();
    }
  }
}
