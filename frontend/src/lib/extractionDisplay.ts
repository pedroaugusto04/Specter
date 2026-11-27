import type { FieldDefinitionDto } from '@specter/contracts';
import { formatObservedNumber } from './numberFormatting';

export type ExtractionFieldDefinitions = Record<string, FieldDefinitionDto>;

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

  const localizeRecord = (record: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => {
        const field =
          fields[key] ??
          Object.values(fields).find((candidate) => candidate.displayName?.trim() === key);
        const label = labels[key] ?? key;
        if (field?.type !== 'number') {
          return [label, localizeNested(value)];
        }
        return [label, formatObservedNumber(value, field.locale, field.displayName || key)];
      })
    );

  const localizeNested = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(localizeNested);
    if (value && typeof value === 'object') return localizeRecord(value as Record<string, unknown>);
    return value;
  };

  if (!payload || typeof payload !== 'object') return payload;
  return localizeNested(payload);
}
