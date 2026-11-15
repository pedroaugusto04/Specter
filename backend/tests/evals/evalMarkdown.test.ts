import { describe, expect, it } from 'vitest';
import { renderEvalMarkdown } from '../../src/evals/markdown.js';
import { summarizeEvalResults } from '../../src/evals/summary.js';
import { EvalOutcome, type EvalCaseResult, type EvalRunMeta } from '../../src/evals/types.js';

const meta: EvalRunMeta = {
  suite: 'test',
  tier: 'T1',
  provider: { name: 'api', model: 'gemini-3.5-flash-lite' },
  runs: 1,
  startedAt: '2026-01-01T00:00:00Z',
  finishedAt: '2026-01-01T00:02:00Z',
  nodeVersion: 'v22.0.0',
};

function result(caseId: string, outcome: EvalOutcome, tags: Record<string, string> = {}): EvalCaseResult {
  return { caseId, caseName: caseId, run: 1, tags, outcome, records: 1, durationMs: 5000, transport: 'http' };
}

describe('renderEvalMarkdown', () => {
  it('produces a valid markdown report with all sections', () => {
    const summary = summarizeEvalResults(meta, [
      result('a', EvalOutcome.Correct, { siteType: 'ecommerce' }),
      result('b', EvalOutcome.Blocked, { siteType: 'news' }),
      result('c', EvalOutcome.Correct, { siteType: 'news' }),
    ]);
    const md = renderEvalMarkdown(summary);
    expect(md).toContain('# Specter Evals: test');
    expect(md).toContain('api · gemini-3.5-flash-lite');
    expect(md).toContain('## Consolidado');
    expect(md).toContain('## Por transport');
    expect(md).toContain('## Por siteType');
    expect(md).toContain('## Distribuição de resultados');
    expect(md).toContain('## Falhas');
    expect(md).toContain('BLOCKED');
  });

  it('includes CI bounds', () => {
    const summary = summarizeEvalResults(meta, [
      result('a', EvalOutcome.Correct),
      result('b', EvalOutcome.WrongValue),
    ]);
    const md = renderEvalMarkdown(summary);
    // Should have two percentage ranges in the consolidated row
    expect(md).toMatch(/\d+\.\d%–\d+\.\d%/);
  });
});
