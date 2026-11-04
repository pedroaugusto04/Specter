import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createFixtureModelProvider,
  evaluateConfigurationCorpus,
  validateConfigurationEvaluationCase,
  type ConfigurationEvaluationCase,
} from '../src/extraction/configurationEvaluation.js';

describe('Configuration evaluation corpus', () => {
  it('replays recorded model stages through the fixture-backed configuration pipeline', async () => {
    const corpus = JSON.parse(
      await readFile('tests/fixtures/configuration-evaluation-corpus.json', 'utf8')
    ) as { version: number; cases: ConfigurationEvaluationCase[] };
    expect(corpus.version).toBe(1);
    corpus.cases.forEach(validateConfigurationEvaluationCase);

    const report = await evaluateConfigurationCorpus(corpus.cases, (item) =>
      createFixtureModelProvider(item.responses)
    );

    expect(report.results.filter((result) => !result.passed)).toEqual([]);
    expect(report.fieldAccuracy).toBe(1);
    expect(report.entityAccuracy).toBe(1);
    expect(report.qualityAccuracy).toBe(1);
    expect(report.falseAlerts).toBe(0);
    expect(report.missedAlerts).toBe(0);
    expect(report.modelCalls).toBe(13);
    expect(report.stages.intent!.calls).toBe(3);
    expect(report.stages.discovery!.calls).toBe(4);
    expect(report.stages.plan!.calls).toBe(3);
    expect(report.stages.interaction!.calls).toBe(1);
  });
});
