/** Shared extraction vocabulary; safe to import from browser and server code. */
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

export const ExtractionMode = { Single: 'single', Collection: 'collection' } as const;

export type ExtractionMode = (typeof ExtractionMode)[keyof typeof ExtractionMode];

export const ExtractionScope = { Page: 'page', Collection: 'collection' } as const;

export type ExtractionScope = (typeof ExtractionScope)[keyof typeof ExtractionScope];

export const SourceKind = { Dom: 'dom', JsonLd: 'jsonld', Response: 'response' } as const;

export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];

export const Transport = { Http: 'http', Browser: 'browser' } as const;

export type Transport = (typeof Transport)[keyof typeof Transport];

export const FieldType = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Date: 'date',
  Url: 'url',
} as const;

export type FieldType = (typeof FieldType)[keyof typeof FieldType];

export const SemanticReviewStatus = {
  Passed: 'PASSED',
  Warning: 'WARNING',
  Rejected: 'REJECTED',
  Error: 'ERROR',
  Skipped: 'SKIPPED',
} as const;

export type SemanticReviewStatus = (typeof SemanticReviewStatus)[keyof typeof SemanticReviewStatus];

export const FailureCode = {
  Limit: 'LIMIT',
  NoProgress: 'NO_PROGRESS',
  Readiness: 'READINESS',
  Source: 'SOURCE',
  Navigation: 'NAVIGATION',
  Timeout: 'TIMEOUT',
} as const;

export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];

export const TraceStatus = { Success: 'SUCCESS', Failed: 'FAILED', Skipped: 'SKIPPED' } as const;

export type TraceStatus = (typeof TraceStatus)[keyof typeof TraceStatus];

export const EntityChangeKind = {
  Added: 'ADDED',
  Modified: 'MODIFIED',
  Removed: 'REMOVED',
} as const;

export type EntityChangeKind = (typeof EntityChangeKind)[keyof typeof EntityChangeKind];
