export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Validates and normalizes an IANA timezone identifier, falling back to America/Sao_Paulo.
 */
export function resolveTimezone(tz?: string | null): string {
  const trimmed = tz?.trim();
  if (!trimmed) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function formatDateTimeWithZone(
  date: Date | string | undefined | null,
  timeZone: string | null | undefined,
  dateStyle: 'medium' | 'long',
  includeTzSuffix: boolean
): string {
  const parsed = date ? (date instanceof Date ? date : new Date(date)) : new Date();
  if (Number.isNaN(parsed.getTime())) return String(date ?? '—');

  const tz = resolveTimezone(timeZone);
  const formatted = new Intl.DateTimeFormat('en-US', {
    dateStyle,
    timeStyle: 'medium',
    timeZone: tz,
  }).format(parsed);
  return includeTzSuffix ? `${formatted} (${tz})` : formatted;
}

/**
 * Formats a Date/string for human-readable notification displays (e.g. Telegram alerts).
 */
export function formatNotificationDateTime(
  date: Date | string | undefined | null,
  timeZone?: string | null,
  options: { includeTzSuffix?: boolean } = { includeTzSuffix: true }
): string {
  return formatDateTimeWithZone(date, timeZone, 'medium', options.includeTzSuffix ?? true);
}

/**
 * Formats a Date/string for transactional email alerts.
 */
export function formatEmailDateTime(
  date: Date | string | undefined | null,
  timeZone?: string | null
): string {
  return formatDateTimeWithZone(date, timeZone, 'long', true);
}
