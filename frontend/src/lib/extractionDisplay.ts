import type { IntentField } from '@specter/contracts';
import { formatObservedNumber } from './numberFormatting';

export type ExtractionFieldDefinitions = Record<string, Pick<IntentField, 'displayName' | 'type' | 'locale'>>;

export function getExtractionFieldLabels(fields: ExtractionFieldDefinitions = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.displayName?.trim() || key])
  );
}

export function localizeExtractedPayload(
  payload: unknown,
  fields: ExtractionFieldDefinitions = {}
): unknown {
  const labels = getExtractionFieldLabels(fields);
  const localizeRecord = (record: unknown) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => {
        const field = fields[key] ?? Object.values(fields).find(
          (candidate) => candidate.displayName?.trim() === key
        );
        if (field?.type !== 'number') return [labels[key] ?? key, value];
        const formatted = formatObservedNumber(value, field.locale, field.displayName || key);
        return [labels[key] ?? key, formatted];
      })
    );
  };

  if (!payload || typeof payload !== 'object') return payload;
  if ('items' in payload && Array.isArray(payload.items)) {
    return { ...payload, items: payload.items.map(localizeRecord) };
  }
  return localizeRecord(payload);
}
