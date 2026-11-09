import { FieldType } from './constants.js';
import { parseLocalizedNumber } from './localizedNumber.js';
import type { IntentField, Scalar } from './contracts.js';
import { sanitizeVolatileString } from '../utils/diffHasher.js';

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
    case FieldType.Date: {
      if (
        !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(text)
      )
        return null;
      const date = new Date(text);
      if (
        !Number.isFinite(date.getTime()) ||
        (date.toISOString().slice(0, 10) !== text.slice(0, 10) && text.length === 10)
      )
        return null;
      return date.toISOString();
    }
    case FieldType.Number: {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (field.locale) {
        const localized = parseLocalizedNumber(text, field.locale);
        if (localized !== null) return localized;
      }
      if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
        const standard = Number(text);
        if (Number.isFinite(standard)) return standard;
      }
      const parenMatches = [...text.matchAll(/\(\s*([+-]?[\d.,\s]+)\s*\)/g)];
      if (parenMatches.length === 1 && parenMatches[0]?.[1]) {
        const outside = text.replace(parenMatches[0][0], '').trim();
        if (/[a-zA-ZÀ-ÿ]/.test(outside)) {
          const candidate = parenMatches[0][1].trim();
          if (field.locale) {
            const localized = parseLocalizedNumber(candidate, field.locale);
            if (localized !== null) return localized;
          }
          if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(candidate)) {
            const standard = Number(candidate);
            if (Number.isFinite(standard)) return standard;
          }
        }
      }
      return null;
    }
  }
}

export { recordIdentity } from '@specter/contracts';

export function compareIdentityText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
