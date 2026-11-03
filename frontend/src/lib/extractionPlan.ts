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

export interface ExtractionField {
  sources: Array<
    | { kind: typeof EXTRACTION_SOURCE_KIND.Dom; selector: string; attribute?: string }
    | { kind: typeof EXTRACTION_SOURCE_KIND.JsonLd; path: Array<string | number> }
  >;
  type: (typeof FIELD_VALUE_TYPE)[keyof typeof FIELD_VALUE_TYPE];
  required: boolean;
  normalizeVolatileText?: boolean;
  locale?: string;
  booleanValues?: Record<string, boolean>;
}

export interface TriggerRule {
  field: string;
  operator: (typeof TRIGGER_OPERATOR)[keyof typeof TRIGGER_OPERATOR];
  value: string | number | boolean;
}

export type TriggerOperator = (typeof TRIGGER_OPERATOR)[keyof typeof TRIGGER_OPERATOR];

export interface ExtractionPlan {
  version: 2;
  mode: (typeof EXTRACTION_MODE)[keyof typeof EXTRACTION_MODE];
  containerSelector?: string;
  jsonLdType?: string;
  fields: Record<string, ExtractionField>;
  identityFields: string[];
  readySelector: string;
  emptySelector?: string;
  scope: (typeof EXTRACTION_SCOPE)[keyof typeof EXTRACTION_SCOPE];
  pagination?: {
    kind: (typeof PAGINATION_KIND)[keyof typeof PAGINATION_KIND];
    nextSelector?: string;
    endSelector: string;
  };
  triggerRules: TriggerRule[];
  triggerMatchMode: (typeof TRIGGER_MATCH_MODE)[keyof typeof TRIGGER_MATCH_MODE];
}
