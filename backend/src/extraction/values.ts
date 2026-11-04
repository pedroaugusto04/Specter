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
    case FieldType.Boolean:
      return field.booleanValues?.[text.toLowerCase()] ?? null;
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
      return field.locale ? parseLocalizedNumber(text, field.locale) : null;
    }
  }
}

export function recordIdentity(record: Record<string, Scalar>, fields: string[]): string {
  return JSON.stringify(fields.map((field) => record[field]));
}

export function compareIdentityText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
