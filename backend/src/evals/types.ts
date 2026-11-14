/**
 * Shared vocabulary for every evaluation suite (offline corpus, synthetic, live).
 * Suites stay provider-agnostic: the active compiler provider is resolved from the
 * environment (or CLI override) and recorded in the report metadata only.
 */

export const EvalOutcome = {
  /** Extraction matched the oracle. */
  Correct: 'CORRECT',
  /** A negative case was correctly refused. */
  CorrectRejection: 'CORRECT_REJECTION',
  /** Data was extracted but at least one value diverges from the oracle. */
  WrongValue: 'WRONG_VALUE',
  /** Required fields or records are missing. */
  Partial: 'PARTIAL',
  /** Nothing was extracted although data exists. */
  FalseEmpty: 'FALSE_EMPTY',
  /** A configuration that should have been refused was activated. */
  FalseAccept: 'FALSE_ACCEPT',
  /** The pipeline could not produce an acceptable plan. */
  NoValidPlan: 'NO_VALID_PLAN',
  /** The semantic reviewer rejected the plan. */
  SemanticRejected: 'SEMANTIC_REJECTED',
  /** The target website blocked access (WAF, CAPTCHA, 403/429). */
  Blocked: 'BLOCKED',
  /** Navigation or acquisition timed out. */
  Timeout: 'TIMEOUT',
  /** Transient network failure while reaching the target. */
  Network: 'NETWORK',
  /** The compiler/model failed (timeout, invalid output, API error). */
  ModelError: 'MODEL_ERROR',
  /** Local infrastructure limits (browser capacity, unblocker quota). Excluded from rates. */
  Infra: 'INFRA',
  /** Unclassified error. */
  Error: 'ERROR',
} as const;
export type EvalOutcome = (typeof EvalOutcome)[keyof typeof EvalOutcome];

export const SuccessfulOutcomes: ReadonlySet<EvalOutcome> = new Set([
  EvalOutcome.Correct,
  EvalOutcome.CorrectRejection,
]);

/** Outcomes that say nothing about product quality and are excluded from success rates. */
export const UnscoredOutcomes: ReadonlySet<EvalOutcome> = new Set([EvalOutcome.Infra]);

export type EvalTier = 'T0' | 'T1' | 'T2' | 'T3';

/** Scenario dimensions used to slice success rates. All keys are optional and open-ended. */
export interface EvalTags {
  siteType?: string;
  render?: string;
  dataSource?: string;
  mode?: string;
  interaction?: string;
  protection?: string;
  locale?: string;
  challenges?: string[];
  [dimension: string]: string | string[] | undefined;
}

export interface EvalVerdict {
  outcome: EvalOutcome;
  reason?: string;
}

export interface EvalCaseResult extends EvalVerdict {
  caseId: string;
  caseName: string;
  /** 1-based repetition index. */
  run: number;
  tags: EvalTags;
  errorCode?: string;
  /** Transport effectively chosen by the pipeline. */
  transport?: string;
  mode?: string;
  records: number;
  durationMs: number;
  semanticScore?: number;
  modelCalls?: number;
  /** First extracted records, kept for auditing published numbers. */
  sample?: Record<string, unknown>[];
}

export interface EvalProviderInfo {
  name: string;
  model?: string;
}

export interface EvalRunMeta {
  suite: string;
  tier: EvalTier;
  provider: EvalProviderInfo;
  runs: number;
  startedAt: string;
  finishedAt: string;
  nodeVersion: string;
  filters?: Record<string, string | string[]>;
}
