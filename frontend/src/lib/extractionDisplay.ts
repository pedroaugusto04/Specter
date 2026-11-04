import type { IntentField } from '@specter/contracts';

export type ExtractionFieldDefinitions = Record<string, IntentField>;

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
      Object.entries(record).map(([key, value]) => [labels[key] ?? key, value])
    );
  };

  if (!payload || typeof payload !== 'object') return payload;
  if ('items' in payload && Array.isArray(payload.items)) {
    return { ...payload, items: payload.items.map(localizeRecord) };
  }
  return localizeRecord(payload);
}
