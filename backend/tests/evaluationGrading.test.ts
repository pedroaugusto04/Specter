import { readFile } from 'node:fs/promises';
import { evaluateIsolatedStages } from '../src/extraction/stageEvaluation.js';
import { describe, expect, it } from 'vitest';
import {
  createFixtureModelProvider,
  evaluateConfigurationCorpus,
  type ConfigurationEvaluationCase,
} from '../src/extraction/configurationEvaluation.js';

async function fixture() {
  const corpus = JSON.parse(
    await readFile('tests/fixtures/configuration-evaluation-corpus.json', 'utf8')
  ) as {
    cases: ConfigurationEvaluationCase[];
  };
  return structuredClone(corpus.cases[0]!);
}
const evaluate = (item: ConfigurationEvaluationCase) =>
  evaluateConfigurationCorpus([item], (entry) => createFixtureModelProvider(entry.responses));

describe('Evaluation graders detect regressions', () => {
  it('detects the wrong intent even when extracted fields match', async () => {
    const item = await fixture();
    item.expectedIntent!.entity = 'A different requested entity';
    const report = await evaluate(item);
    expect(report.results[0]!.checks.intent).toBe(false);
    expect(report.results[0]!.passed).toBe(false);
    expect(report.fieldAccuracy).toBe(1);
  });

  it('counts a false activation independently of correct values', async () => {
    const item = await fixture();
    item.expectedQuality = 'FAILED';
    item.expectedErrorCode = 'CONFIGURATION_REJECTED';
    const report = await evaluate(item);
    expect(report.falseAcceptances).toBe(1);
    expect(report.results[0]!.passed).toBe(false);
  });

  it('fails on a missed alert and on exceeding a model call budget', async () => {
    const item = await fixture();
    item.expectChange = true;
    item.maxModelCalls = { plan: 0 };
    const report = await evaluate(item);
    expect(report.missedAlerts).toBe(1);
    expect(report.results[0]!.checks['budget:plan']).toBe(false);
    expect(report.results[0]!.checks.alerts).toBe(false);
  });

  it('does not accept an arbitrary exception as an expected rejection', async () => {
    const item = await fixture();
    item.expectedQuality = 'FAILED';
    const report = await evaluateConfigurationCorpus([item], {
      name: 'unavailable',
      generate: async () => {
        throw new Error('Unavailable');
      },
    });
    expect(report.results[0]!.checks.acceptance).toBe(false);
    expect(report.results[0]!.passed).toBe(false);
  });

  it('isolates plan generation from an incorrect interpreter result', async () => {
    const item = await fixture();
    item.isolated = true;
    const report = await evaluateIsolatedStages([item], (entry) => {
      const recorded = createFixtureModelProvider(entry.responses);
      return {
        name: 'wrong-interpreter',
        generate: async (input) => {
          if (input.task === 'intent') return { ...entry.expectedIntent, entity: 'Wrong entity' };
          return recorded.generate(input);
        },
      };
    });
    expect(report.results.find((result) => result.stage === 'intent')!.passed).toBe(false);
    expect(report.results.find((result) => result.stage === 'plan')!.passed).toBe(true);
    expect(report.passed).toBe(false);
  });

  it('requires nonempty corpora and unique case names', async () => {
    const item = await fixture();
    await expect(
      evaluateConfigurationCorpus([], () => createFixtureModelProvider(item.responses))
    ).rejects.toThrow('must contain cases');
    await expect(
      evaluateConfigurationCorpus([item, item], () => createFixtureModelProvider(item.responses))
    ).rejects.toThrow('must be unique');
  });
});
