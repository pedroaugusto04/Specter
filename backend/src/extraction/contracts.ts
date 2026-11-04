/** Domain contracts: no browser, database, queue or model dependencies. */
export type Scalar = string | number | boolean | null;
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'url';
export type TriggerOperator =
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains'
  | 'percentage_drop'
  | 'percentage_increase'
  | 'decreased'
  | 'increased'
  | 'changes';
export interface TriggerRule {
  field: string;
  operator: TriggerOperator;
  value: Exclude<Scalar, null>;
}
export interface IntentField {
  description: string;
  type: FieldType;
  required: boolean;
  locale?: string;
  booleanValues?: Record<string, boolean>;
  normalizeVolatileText?: boolean;
}
export interface ExtractionIntent {
  entity: string;
  mode: 'single' | 'collection';
  scope: 'page' | 'collection';
  fields: Record<string, IntentField>;
  identityFields: string[];
  filters: string[];
  triggerRules: TriggerRule[];
  triggerMatchMode: 'all' | 'any';
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
  kind: 'ADDED' | 'MODIFIED' | 'REMOVED';
  previous: Record<string, Scalar> | null;
  current: Record<string, Scalar> | null;
}
export interface ExecutionStrategy {
  transport: 'http' | 'browser';
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
export interface SemanticPolicy {
  enabled?: boolean;
  threshold?: number;
}
export interface SemanticReview {
  status: 'PASSED' | 'WARNING' | 'REJECTED' | 'ERROR' | 'SKIPPED';
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
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  code?: string;
}
export interface NetworkResponse {
  url: string;
  method: string;
  status: number;
  body: unknown;
}
export interface DocumentSnapshot {
  transport?: 'http' | 'browser';
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
  quality: 'COMPLETE' | 'EMPTY' | 'PARTIAL' | 'INVALID' | 'BLOCKED' | 'INCONCLUSIVE';
  issues: string[];
  sourcesUsed: Record<string, number>;
  evidence: FieldEvidence[];
  ready: boolean;
  ended: boolean;
  nextUrl?: string;
}
export interface ExecutionPolicy {
  timeoutMs: number;
  navigationTimeoutMs: number;
  actionTimeoutMs: number;
  pollIntervalMs: number;
  maxPages: number;
  maxActions: number;
  maxItems: number;
  maxEvidence: number;
}
export interface ExecutionContext {
  readonly runId: string;
  readonly deadline: number;
  readonly signal: AbortSignal;
  remaining(): number;
  check(): void;
}
export type DiscoveryAction =
  | { kind: 'inspect'; selector: string }
  | { kind: 'click'; locator: Locator }
  | { kind: 'scroll'; selector?: string }
  | { kind: 'wait'; condition: Condition };
export interface DocumentSession {
  snapshot(): Promise<DocumentSnapshot>;
  check(condition: Condition): Promise<boolean | undefined>;
  advance(pagination: NonNullable<ExecutionStrategy['pagination']>): Promise<void>;
  discover(action: DiscoveryAction): Promise<DocumentSnapshot>;
  screenshot(): Promise<Uint8Array | undefined>;
  close(): Promise<void>;
}
export interface DocumentAdapter {
  open(
    url: string,
    plan: ExtractionPlan,
    context: ExecutionContext,
    options: { storageState?: unknown; captureScreenshot?: boolean }
  ): Promise<DocumentSession>;
}

export interface ExtractionReport {
  planRevision?: string;
  validatedSourceRecords?: number;
  quality: PageExtraction['quality'];
  scope: 'page' | 'collection';
  pagesVisited: number;
  issues: string[];
  sourcesUsed: Record<string, number>;
  evidence?: FieldEvidence[];
  trace?: StageTrace[];
  semanticReview?: SemanticReview;
  failureCode?: 'LIMIT' | 'NO_PROGRESS' | 'READINESS' | 'SOURCE' | 'NAVIGATION' | 'TIMEOUT';
  integrity?: 'VALID' | 'INVALID';
  coverage?: 'COMPLETE' | 'EMPTY' | 'PARTIAL' | 'UNKNOWN';
}
