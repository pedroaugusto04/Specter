import { describe, expect, it } from 'vitest';
import { summarizeEvalResults } from '../../src/evals/summary.js';
import { EvalOutcome, type EvalCaseResult, type EvalRunMeta } from '../../src/evals/types.js';

const meta: EvalRunMeta = {
  suite: 'test',
  tier: 'T1',
  provider: { name: 'agy' },
  runs: 2,
  startedAt: '2026-01-01T00:00:00Z',
  finishedAt: '2026-01-01T00:05:00Z',
  nodeVersion: 'v22.0.0',
};

function result(
  overrides: Partial<EvalCaseResult> & Pick<EvalCaseResult, 'caseId' | 'outcome'>
): EvalCaseResult {
  return {
    caseName: overrides.caseId,
    run: 1,
    tags: {},
    records: 1,
    durationMs: 1000,
    ...overrides,
  };
}

describe('summarizeEvalResults', () => {
  it('computes overall rate and CI', () => {
    const results = [
      result({ caseId: 'a', outcome: EvalOutcome.Correct, run: 1 }),
      result({ caseId: 'a', outcome: EvalOutcome.Correct, run: 2 }),
      result({ caseId: 'b', outcome: EvalOutcome.WrongValue, run: 1 }),
      result({ caseId: 'b', outcome: EvalOutcome.Correct, run: 2 }),
    ];
    const summary = summarizeEvalResults(meta, results);
    expect(summary.overall.cases).toBe(2);
    expect(summary.overall.executions).toBe(4);
    expect(summary.overall.passed).toBe(3);
    expect(summary.overall.scored).toBe(4);
    expect(summary.overall.rate).toBe(0.75);
    expect(summary.overall.ci95[0]).toBeGreaterThan(0);
    expect(summary.overall.ci95[1]).toBeLessThanOrEqual(1);
  });

  it('excludes INFRA outcomes from rate but counts them in executions', () => {
    const results = [
      result({ caseId: 'a', outcome: EvalOutcome.Correct }),
      result({ caseId: 'b', outcome: EvalOutcome.Infra }),
    ];
    const summary = summarizeEvalResults(meta, results);
    expect(summary.overall.executions).toBe(2);
    expect(summary.overall.scored).toBe(1);
    expect(summary.overall.rate).toBe(1); // 1/1
  });

  it('computes consistency (pass^k)', () => {
    const results = [
      result({ caseId: 'a', outcome: EvalOutcome.Correct, run: 1 }),
      result({ caseId: 'a', outcome: EvalOutcome.Correct, run: 2 }),
      result({ caseId: 'b', outcome: EvalOutcome.Correct, run: 1 }),
      result({ caseId: 'b', outcome: EvalOutcome.WrongValue, run: 2 }),
    ];
    const summary = summarizeEvalResults(meta, results);
    expect(summary.overall.consistentCases).toBe(1); // only 'a'
    expect(summary.overall.consistency).toBe(0.5);
  });

  it('groups by siteType tag', () => {
    const results = [
      result({ caseId: 'a', outcome: EvalOutcome.Correct, tags: { siteType: 'news' } }),
      result({ caseId: 'b', outcome: EvalOutcome.Blocked, tags: { siteType: 'ecommerce' } }),
      result({ caseId: 'c', outcome: EvalOutcome.Correct, tags: { siteType: 'news' } }),
    ];
    const summary = summarizeEvalResults(meta, results);
    const siteType = summary.dimensions.siteType;
    expect(siteType).toBeDefined();
    const newsCell = siteType!.find((cell) => cell.key === 'news');
    expect(newsCell?.rate).toBe(1);
    const ecommerceCell = siteType!.find((cell) => cell.key === 'ecommerce');
    expect(ecommerceCell?.rate).toBe(0);
  });

  it('groups by effective transport', () => {
    const results = [
      result({ caseId: 'a', outcome: EvalOutcome.Correct, transport: 'http' }),
      result({ caseId: 'b', outcome: EvalOutcome.Correct, transport: 'browser' }),
      result({ caseId: 'c', outcome: EvalOutcome.WrongValue, transport: 'http' }),
    ];
    const summary = summarizeEvalResults(meta, results);
    const transport = summary.dimensions.transport;
    expect(transport).toBeDefined();
    expect(transport!.find((cell) => cell.key === 'http')?.rate).toBe(0.5);
    expect(transport!.find((cell) => cell.key === 'browser')?.rate).toBe(1);
  });

  it('records topFailure per cell', () => {
    const results = [
      result({ caseId: 'a', outcome: EvalOutcome.Blocked, tags: { siteType: 'travel' } }),
      result({ caseId: 'b', outcome: EvalOutcome.Blocked, tags: { siteType: 'travel' } }),
      result({ caseId: 'c', outcome: EvalOutcome.Timeout, tags: { siteType: 'travel' } }),
    ];
    const summary = summarizeEvalResults(meta, results);
    const travelCell = summary.dimensions.siteType!.find((cell) => cell.key === 'travel');
    expect(travelCell?.topFailure?.outcome).toBe(EvalOutcome.Blocked);
    expect(travelCell?.topFailure?.count).toBe(2);
  });

  it('lists failures with reasons', () => {
    const results = [
      result({
        caseId: 'x',
        outcome: EvalOutcome.WrongValue,
        reason: 'Price mismatch',
        errorCode: 'EXTRACTION_WRONG',
      }),
    ];
    const summary = summarizeEvalResults(meta, results);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]?.reason).toBe('Price mismatch');
    expect(summary.failures[0]?.errorCode).toBe('EXTRACTION_WRONG');
  });

  it('computes avgModelCalls when provided', () => {
    const results = [
      result({ caseId: 'a', outcome: EvalOutcome.Correct, modelCalls: 4 }),
      result({ caseId: 'b', outcome: EvalOutcome.Correct, modelCalls: 6 }),
    ];
    const summary = summarizeEvalResults(meta, results);
    expect(summary.overall.avgModelCalls).toBe(5);
  });
});
