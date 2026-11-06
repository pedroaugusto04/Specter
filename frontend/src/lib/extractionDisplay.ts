import type { IntentField } from '@specter/contracts';
import { formatObservedNumber, isMonetaryField } from './numberFormatting';

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
        const displayLabel = field?.displayName || key;
        if (field?.type !== 'number' && !isMonetaryField(displayLabel)) {
          return [labels[key] ?? key, localizeNested(value)];
        }
        const formatted = formatObservedNumber(value, field?.locale, displayLabel);
        return [labels[key] ?? key, formatted];
      })
    );
  };
  const localizeNested = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(localizeNested);
    if (value && typeof value === 'object') return localizeRecord(value);
    return value;
  };

  if (!payload || typeof payload !== 'object') return payload;
  return localizeNested(payload);
}
