import { percentile, wilsonInterval } from './stats.js';
import {
  SuccessfulOutcomes,
  UnscoredOutcomes,
  type EvalCaseResult,
  type EvalOutcome,
  type EvalRunMeta,
} from './types.js';

export interface RateCell {
  key: string;
  executions: number;
  /** Executions that count toward the rate (infrastructure failures excluded). */
  scored: number;
  passed: number;
  rate: number;
  ci95: [number, number];
  p50Ms: number;
  p95Ms: number;
  topFailure?: { outcome: EvalOutcome; count: number };
}

export interface EvalSummary {
  meta: EvalRunMeta;
  overall: RateCell & {
    cases: number;
    /** Cases that passed in every scored repetition (pass^k). */
    consistentCases: number;
    consistency: number;
    avgModelCalls?: number;
  };
  dimensions: Record<string, RateCell[]>;
  outcomes: Partial<Record<EvalOutcome, number>>;
  failures: Array<Pick<EvalCaseResult, 'caseId' | 'run' | 'outcome' | 'reason' | 'errorCode'>>;
}

const UNSPECIFIED = '(unspecified)';

function rateCell(key: string, results: EvalCaseResult[]): RateCell {
  const scored = results.filter((item) => !UnscoredOutcomes.has(item.outcome));
  const passed = scored.filter((item) => SuccessfulOutcomes.has(item.outcome)).length;
  const failures = new Map<EvalOutcome, number>();
  for (const item of scored)
    if (!SuccessfulOutcomes.has(item.outcome))
      failures.set(item.outcome, (failures.get(item.outcome) ?? 0) + 1);
  const top = [...failures.entries()].sort((a, b) => b[1] - a[1])[0];
  const durations = results.map((item) => item.durationMs);
  return {
    key,
    executions: results.length,
    scored: scored.length,
    passed,
    rate: scored.length ? passed / scored.length : 0,
    ci95: wilsonInterval(passed, scored.length),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    ...(top ? { topFailure: { outcome: top[0], count: top[1] } } : {}),
  };
}

function dimensionValues(result: EvalCaseResult, dimension: string): string[] {
  const value =
    dimension === 'transport'
      ? result.transport
      : dimension === 'mode'
        ? (result.mode ?? result.tags.mode)
        : result.tags[dimension];
  if (Array.isArray(value)) return value.length ? value : [UNSPECIFIED];
  return [value ?? UNSPECIFIED];
}

function groupBy(results: EvalCaseResult[], dimension: string): RateCell[] {
  const groups = new Map<string, EvalCaseResult[]>();
  for (const result of results)
    for (const value of dimensionValues(result, dimension))
      groups.set(value, [...(groups.get(value) ?? []), result]);
  return [...groups.entries()]
    .map(([key, items]) => rateCell(key, items))
    .sort((a, b) => b.executions - a.executions || a.key.localeCompare(b.key));
}

/** Aggregates raw results into a consolidated rate plus one table per scenario dimension. */
export function summarizeEvalResults(meta: EvalRunMeta, results: EvalCaseResult[]): EvalSummary {
  const tagDimensions = new Set(results.flatMap((item) => Object.keys(item.tags)));
  const dimensions = ['transport', 'mode', ...[...tagDimensions].filter((key) => key !== 'mode')];

  const byCase = new Map<string, EvalCaseResult[]>();
  for (const result of results)
    byCase.set(result.caseId, [...(byCase.get(result.caseId) ?? []), result]);
  const scoredCases = [...byCase.values()]
    .map((items) => items.filter((item) => !UnscoredOutcomes.has(item.outcome)))
    .filter((items) => items.length);
  const consistentCases = scoredCases.filter((items) =>
    items.every((item) => SuccessfulOutcomes.has(item.outcome))
  ).length;

  const outcomes: EvalSummary['outcomes'] = {};
  for (const result of results) outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;

  const withCalls = results.filter((item) => item.modelCalls !== undefined);
  return {
    meta,
    overall: {
      ...rateCell('overall', results),
      cases: byCase.size,
      consistentCases,
      consistency: scoredCases.length ? consistentCases / scoredCases.length : 0,
      ...(withCalls.length
        ? {
            avgModelCalls:
              withCalls.reduce((total, item) => total + item.modelCalls!, 0) / withCalls.length,
          }
        : {}),
    },
    dimensions: Object.fromEntries(
      dimensions
        .map((dimension) => [dimension, groupBy(results, dimension)] as const)
        .filter(([, cells]) => cells.some((cell) => cell.key !== UNSPECIFIED))
    ),
    outcomes,
    failures: results
      .filter((item) => !SuccessfulOutcomes.has(item.outcome))
      .map(({ caseId, run, outcome, reason, errorCode }) => ({
        caseId,
        run,
        outcome,
        ...(reason ? { reason } : {}),
        ...(errorCode ? { errorCode } : {}),
      })),
  };
}
