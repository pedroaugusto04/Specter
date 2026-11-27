import { FieldType } from './constants.js';
import { parseLocalizedNumber } from './localizedNumber.js';
import type { IntentField, Scalar } from './contracts.js';
import { sanitizeVolatileString } from '../utils/diffHasher.js';

function buildUtcIsoDate(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number
): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }
  return utcDate.toISOString();
}

function parseDateValue(text: string, locale?: string): string | null {
  // 1. ISO-8601 formats (e.g. 2024-05-10, 2024-05-10T12:00:00Z, 2024-05-10 12:00:00)
  if (
    /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(text)
  ) {
    const isoNorm = text.includes(' ') && !text.includes('T') ? text.replace(' ', 'T') : text;
    const date = new Date(isoNorm);
    if (
      Number.isFinite(date.getTime()) &&
      (date.toISOString().slice(0, 10) === text.slice(0, 10) || text.length > 10)
    ) {
      return date.toISOString();
    }
  }

  // 2. Delimited regional formats: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const delimitedMatch = text.match(
    /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (delimitedMatch) {
    const first = Number(delimitedMatch[1]);
    const second = Number(delimitedMatch[2]);
    const year = Number(delimitedMatch[3]);
    const hours = Number(delimitedMatch[4] ?? 0);
    const minutes = Number(delimitedMatch[5] ?? 0);
    const seconds = Number(delimitedMatch[6] ?? 0);

    if (first <= 12 && second <= 12 && first !== second && !locale) return null;

    const monthFirst =
      second > 12 || (first <= 12 && Boolean(locale && /^en-(US|CA)/i.test(locale)));
    const month = monthFirst ? first : second;
    const day = monthFirst ? second : first;

    const iso = buildUtcIsoDate(year, month, day, hours, minutes, seconds);
    if (iso) return iso;
  }

  // 3. Delimited formats: YYYY/MM/DD, YYYY.MM.DD
  const ymdMatch = text.match(
    /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (ymdMatch) {
    return buildUtcIsoDate(
      Number(ymdMatch[1]),
      Number(ymdMatch[2]),
      Number(ymdMatch[3]),
      Number(ymdMatch[4] ?? 0),
      Number(ymdMatch[5] ?? 0),
      Number(ymdMatch[6] ?? 0)
    );
  }

  return null;
}

function tryParseNumber(candidate: string, locale?: string): number | null {
  if (locale) {
    const localized = parseLocalizedNumber(candidate, locale);
    if (localized !== null) return localized;
  }
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(candidate)) {
    const standard = Number(candidate);
    if (Number.isFinite(standard)) return standard;
  }
  return null;
}

export function convertFieldValue(value: unknown, field: IntentField, baseUrl: string): Scalar {
  if (value === null || value === undefined || typeof value === 'object') return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  switch (field.type) {
    case FieldType.String:
      return field.normalizeVolatileText ? sanitizeVolatileString(text) : text;
    case FieldType.Boolean: {
      if (typeof value === 'boolean') return value;
      const lower = text.toLowerCase();
      if (field.booleanValues && lower in field.booleanValues) {
        return field.booleanValues[lower]!;
      }
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
      return null;
    }
    case FieldType.Url:
      try {
        const url = new URL(text, baseUrl);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
      } catch {
        return null;
      }
    case FieldType.Date:
      return parseDateValue(text, field.locale);
    case FieldType.Number: {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      return tryParseNumber(text, field.locale);
    }
  }
}

export { recordIdentity } from '@specter/contracts';

export function compareIdentityText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
