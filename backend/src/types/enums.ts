export const JobStatus = {
  PendingCompilation: 'PENDING_COMPILATION',
  Active: 'ACTIVE',
  Failed: 'FAILED',
  Healing: 'HEALING',
  Paused: 'PAUSED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const RunStatus = { Success: 'SUCCESS', Failed: 'FAILED' } as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const ChangeStatus = { Changed: 'YES', Unchanged: 'NO', Initial: 'INITIAL' } as const;
export type ChangeStatus = (typeof ChangeStatus)[keyof typeof ChangeStatus];

export const ExtractionMode = { Single: 'single', Collection: 'collection' } as const;
export type ExtractionMode = (typeof ExtractionMode)[keyof typeof ExtractionMode];

export const ExtractionScope = { Page: 'page', Collection: 'collection' } as const;
export type ExtractionScope = (typeof ExtractionScope)[keyof typeof ExtractionScope];

export const ExtractionSourceKind = { Dom: 'dom', JsonLd: 'jsonld' } as const;
export type ExtractionSourceKind = (typeof ExtractionSourceKind)[keyof typeof ExtractionSourceKind];

export const PaginationKind = { Link: 'link', Click: 'click', Scroll: 'scroll' } as const;
export type PaginationKind = (typeof PaginationKind)[keyof typeof PaginationKind];

export const FieldValueType = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Date: 'date',
  Url: 'url',
} as const;
export type FieldValueType = (typeof FieldValueType)[keyof typeof FieldValueType];

export const TriggerMatchMode = { All: 'all', Any: 'any' } as const;
export type TriggerMatchMode = (typeof TriggerMatchMode)[keyof typeof TriggerMatchMode];

export const ExtractionQuality = {
  Complete: 'COMPLETE',
  Empty: 'EMPTY',
  Partial: 'PARTIAL',
  Blocked: 'BLOCKED',
  Invalid: 'INVALID',
  Inconclusive: 'INCONCLUSIVE',
} as const;
export type ExtractionQuality = (typeof ExtractionQuality)[keyof typeof ExtractionQuality];

export function isAcceptedExtractionQuality(quality: ExtractionQuality): boolean {
  return quality === ExtractionQuality.Complete || quality === ExtractionQuality.Empty;
}

export const TriggerOperator = {
  LessThan: 'lt',
  LessThanOrEqual: 'lte',
  GreaterThan: 'gt',
  GreaterThanOrEqual: 'gte',
  Equal: 'eq',
  NotEqual: 'neq',
  Contains: 'contains',
  NotContains: 'not_contains',
  PercentageDrop: 'percentage_drop',
  PercentageIncrease: 'percentage_increase',
  Decreased: 'decreased',
  Increased: 'increased',
  Changes: 'changes',
} as const;
export type TriggerOperator = (typeof TriggerOperator)[keyof typeof TriggerOperator];

export const DOM_TEXT_ATTRIBUTE = 'text';

export function parseEnumValue<const T extends Record<string, string>>(
  enumValues: T,
  value: string,
  fieldName: string
): T[keyof T] {
  if (!Object.values(enumValues).includes(value)) {
    throw new Error(`Unexpected ${fieldName} value: ${value}`);
  }
  return value as T[keyof T];
}
