export const EXTRACTION_MODE = { Single: 'single', Collection: 'collection' } as const;
export const EXTRACTION_SCOPE = { Page: 'page', Collection: 'collection' } as const;
export const EXTRACTION_SOURCE_KIND = { Dom: 'dom', JsonLd: 'jsonld' } as const;
export const PAGINATION_KIND = { Link: 'link', Click: 'click', Scroll: 'scroll' } as const;
export const FIELD_VALUE_TYPE = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Date: 'date',
  Url: 'url',
} as const;
export const TRIGGER_MATCH_MODE = { All: 'all', Any: 'any' } as const;
export type TriggerMatchMode = (typeof TRIGGER_MATCH_MODE)[keyof typeof TRIGGER_MATCH_MODE];
export const TRIGGER_OPERATOR = {
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

export type ExtractionScope = (typeof EXTRACTION_SCOPE)[keyof typeof EXTRACTION_SCOPE];

// Shared domain contracts contain no runtime/backend dependencies.
export type {
  ExtractionPlan,
  TriggerRule,
  TriggerOperator,
  IntentField as ExtractionField,
  SemanticPolicy,
  SemanticReview,
  FieldEvidence,
  ExtractionReport,
} from '../../../backend/src/extraction/contracts';
