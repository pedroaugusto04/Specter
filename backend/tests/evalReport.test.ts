import { describe, expect, it } from 'vitest';
import { writeEvalReport, providerSlug } from '../src/evals/report.js';
import { EvalOutcome, type EvalCaseResult, type EvalRunMeta } from '../src/evals/types.js';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('providerSlug', () => {
  it('uses provider name only when no model', () => {
    expect(providerSlug({ name: 'agy' })).toBe('agy');
  });

  it('combines name and model', () => {
    expect(providerSlug({ name: 'api', model: 'gemini-3.5-flash-lite' })).toBe(
      'api-gemini-3.5-flash-lite'
    );
  });
});

describe('writeEvalReport', () => {
  const tempDir = join(tmpdir(), `specter-eval-report-test-${Date.now()}`);
  const meta: EvalRunMeta = {
    suite: 'unit',
    tier: 'T0',
    provider: { name: 'agy' },
    runs: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    nodeVersion: 'v22.0.0',
  };
  const results: EvalCaseResult[] = [
    {
      caseId: 'test-1',
      caseName: 'Test Case 1',
      run: 1,
      tags: { siteType: 'ecommerce' },
      outcome: EvalOutcome.Correct,
      records: 1,
      durationMs: 500,
      transport: 'http',
    },
  ];

  it('writes summary.json, summary.md and results.jsonl to the latest directory', async () => {
    try {
      const report = await writeEvalReport(meta, results, tempDir);
      expect(report.latestDirectory).toContain('agy/unit/latest');

      const summaryJson = await readFile(join(report.latestDirectory, 'summary.json'), 'utf-8');
      const summary = JSON.parse(summaryJson);
      expect(summary.overall.rate).toBe(1);

      const md = await readFile(join(report.latestDirectory, 'summary.md'), 'utf-8');
      expect(md).toContain('# Specter Evals: unit');

      const jsonl = await readFile(join(report.latestDirectory, 'results.jsonl'), 'utf-8');
      const lines = jsonl.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!).caseId).toBe('test-1');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
