import type { IntentField } from '@specter/contracts';

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
        const numericValue = typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Number(value.trim().replace(/,$/, '').replace(/\./g, '').replace(',', '.'))
            : NaN;
        const formatted = Number.isFinite(numericValue)
          ? new Intl.NumberFormat(field.locale || 'pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(numericValue)
          : value;
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
