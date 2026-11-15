import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { evaluateCorpus, type EvaluationCase } from '../../src/extraction/evaluation.js';
import { PageExtractor } from '../../src/extraction/pageExtractor.js';
import { standardSourceReaders } from '../../src/extraction/sources.js';
import { extractionPlanSchema } from '../../src/types/extractionPlan.js';
describe('Versioned extraction corpus', () => {
  it('preserves expected entities, fields and coverage without false alerts', async () => {
    const corpus = JSON.parse(await readFile('tests/fixtures/extraction-corpus.json', 'utf8')) as {
      version: number;
      cases: EvaluationCase[];
    };
    for (const item of corpus.cases) extractionPlanSchema.parse(item.plan);
    const result = evaluateCorpus(corpus.cases, new PageExtractor(standardSourceReaders()));
    expect(result.results.filter((item) => !item.passed)).toEqual([]);
    expect(result.fieldAccuracy).toBe(1);
    expect(result.falseAlerts).toBe(0);
  });
});
