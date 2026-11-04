import type {
  EntityChangeKind,
  TraceStatus,
  FieldType,
  TriggerOperator,
  ExtractionMode,
  ExtractionScope,
  Transport,
  ExtractionQuality,
  SemanticReviewStatus,
  FailureCode,
  TriggerMatchMode,
} from './vocabulary.js';
/** Domain contracts: no browser, database, queue or model dependencies. */
export type Scalar = string | number | boolean | null;

export type { FieldType, TriggerOperator } from './vocabulary.js';

export interface TriggerRule {
  field: string;
  operator: TriggerOperator;
  value: Exclude<Scalar, null>;
}

export interface IntentField {
  /** Stable semantic identifier is the key in ExtractionIntent.fields. */
  displayName?: string;
  /** Closest observed label for this field on the source page, in its language. */
  observedLabel?: string;
  description: string;
  type: FieldType;
  required: boolean;
  locale?: string;
  booleanValues?: Record<string, boolean>;
  normalizeVolatileText?: boolean;
}

export interface ExtractionIntent {
  entity: string;
  mode: ExtractionMode;
  scope: ExtractionScope;
  fields: Record<string, IntentField>;
  identityFields: string[];
  filters: string[];
  triggerRules: TriggerRule[];
  triggerMatchMode: TriggerMatchMode;
}

export type Locator =
  { kind: 'css'; selector: string } | { kind: 'role'; role: string; name: string; exact?: boolean };

export interface DocumentScope {
  frame?: string;
  shadow?: string;
}

export interface ResponseMatch {
  urlPattern: string;
  method?: string;
}

export type Source =
  | { kind: 'dom'; selector: string; attribute: string; association?: string }
  | { kind: 'jsonld'; path: Array<string | number>; association?: string }
  | { kind: 'response'; path: Array<string | number>; association?: string };

export type Condition =
  | { kind: 'exists' | 'visible' | 'absent' | 'disabled'; locator: Locator }
  | { kind: 'attribute'; locator: Locator; attribute: string; value?: string }
  | { kind: 'field'; field: string }
  | {
      kind: 'response';
      match: ResponseMatch;
      path?: Array<string | number>;
      equals?: Exclude<Scalar, null>;
    };

export interface RecordFilter {
  field: string;
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains' | 'not_contains';
  value: Exclude<Scalar, null>;
}

export interface EntityChange {
  identity: string;
  kind: EntityChangeKind;
  previous: Record<string, Scalar> | null;
  current: Record<string, Scalar> | null;
}

export interface ExecutionStrategy {
  transport: Transport;
  document?: DocumentScope;
  setup?: DiscoveryAction[];
  records:
    | { kind: 'dom'; selector: string }
    | { kind: 'jsonld'; type: string }
    | { kind: 'response'; match: ResponseMatch; path: Array<string | number> };
  filters?: RecordFilter[];
  associations?: Record<
    string,
    {
      localField: string;
      foreignPath: Array<string | number>;
      records:
        | { kind: 'jsonld'; type: string }
        | { kind: 'response'; match: ResponseMatch; path: Array<string | number> };
    }
  >;
  fields: Record<string, Source[]>;
  ready: Condition[];
  empty: Condition[];
  pagination?: {
    kind: 'link' | 'click' | 'scroll';
    next?: Locator;
    scrollTarget?: string;
    end: Condition[];
  };
}

export interface ExtractionPlan {
  version: 3;
  intent: ExtractionIntent;
  strategy: ExecutionStrategy;
}

export interface SemanticReview {
  status: SemanticReviewStatus;
  score: number | null;
  reasons: string[];
  evidenceRefs: string[];
}

export interface FieldEvidence {
  recordIdentity: string;
  field: string;
  sourceIndex: number;
  source: Source;
  raw: Scalar;
  value: Scalar;
}

export interface StageTrace {
  stage: string;
  durationMs: number;
  status: TraceStatus;
  code?: string;
}

export interface NetworkResponse {
  url: string;
  method: string;
  status: number;
  body: unknown;
}

export interface DocumentSnapshot {
  transport?: Transport;
  html: string;
  url: string;
  httpStatus: number;
  responses: NetworkResponse[];
  screenshot?: Uint8Array;
}

export interface PageExtraction {
  records: Record<string, Scalar>[];
  observedIdentities: string[];
  validatedSourceRecords: number;
  quality: ExtractionQuality;
  issues: string[];
  sourcesUsed: Record<string, number>;
  evidence: FieldEvidence[];
  ready: boolean;
  ended: boolean;
  nextUrl?: string;
}

export type DiscoveryAction =
  | { kind: 'inspect'; selector: string }
  | { kind: 'click'; locator: Locator }
  | { kind: 'scroll'; selector?: string }
  | { kind: 'wait'; condition: Condition };

export interface ExtractionReport {
  validatedSourceRecords?: number;
  quality: PageExtraction['quality'];
  scope: ExtractionScope;
  pagesVisited: number;
  issues: string[];
  sourcesUsed: Record<string, number>;
  evidence?: FieldEvidence[];
  trace?: StageTrace[];
  semanticReview?: SemanticReview;
  failureCode?: FailureCode;
  integrity?: 'VALID' | 'INVALID';
  coverage?: 'COMPLETE' | 'EMPTY' | 'PARTIAL' | 'UNKNOWN';
}
