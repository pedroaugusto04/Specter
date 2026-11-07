import { buildSemanticReviewPayload, semanticReviewStatus } from './configurationReview.js';
import { payloadRecords } from './comparison.js';
import { ConfigurationDecisionKind, ConfigurationStage } from './configurationConstants.js';
import type { ConfigurationEvaluationCase } from './configurationEvaluation.js';
import { fixtureExecutor } from './configurationEvaluation.js';
import type { IModelProvider, StageInput } from './model.js';
import { createConfigurationModel } from './configurationModel.js';
import { extractionPlanSchema } from '../types/extractionPlan.js';
import { observation } from './configurationTools.js';
import { canonicalJson } from '../utils/diffHasher.js';

const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
/** Configurator and reviewer receive independent gold inputs, never the other stage's prediction. */
export async function evaluateIsolatedStages(
  cases: ConfigurationEvaluationCase[],
  provider: (item: ConfigurationEvaluationCase) => IModelProvider
) {
  const results: Array<{
    name: string;
    stage: string;
    passed: boolean;
    durationMs: number;
    error?: string;
  }> = [];
  for (const item of cases.filter((entry) => entry.isolated)) {
    if (!item.expectedIntent) throw new Error('Isolated stages require a gold intent.');
    const input: StageInput = {
      jobId: 'isolated-' + item.name,
      url: item.snapshot.url,
      prompt: item.prompt,
      evidence: observation(item.snapshot, 5000),
      timeoutMs: 10000,
    };
    const grade = async (stage: string, action: () => Promise<boolean>) => {
      const started = Date.now();
      try {
        results.push({
          name: item.name,
          stage,
          passed: await action(),
          durationMs: Date.now() - started,
        });
      } catch (error) {
        results.push({
          name: item.name,
          stage,
          passed: false,
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    };
    await grade(ConfigurationStage.Configure, async () => {
      const decision = await createConfigurationModel(provider(item)).decide(input);
      const expected = item.responses.configure[0];
      if (decision.kind === ConfigurationDecisionKind.Tool) return equal(decision, expected);
      const plan = extractionPlanSchema.parse(decision.plan);
      if (!equal(plan.intent, item.expectedIntent)) return false;
      const execution = await fixtureExecutor(item.snapshot, item.interactions).execute(
        item.snapshot.url,
        plan
      );
      const records = payloadRecords(execution.data);
      return (
        execution.report.quality === item.expectedQuality && equal(records, item.expectedRecords)
      );
    });
    await grade(ConfigurationStage.Semantic, async () => {
      const gold = item.responses.configure.find(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          'kind' in entry &&
          entry.kind === ConfigurationDecisionKind.Candidate
      ) as { plan: unknown } | undefined;
      if (!gold) return false;
      const plan = extractionPlanSchema.parse(gold.plan);
      const execution = await fixtureExecutor(item.snapshot, item.interactions).execute(
        item.snapshot.url,
        plan
      );
      const reviewInput = { ...input, evidence: observation(execution.snapshot, 5000) };
      const review = await createConfigurationModel(provider(item)).review(
        reviewInput,
        item.expectedIntent!,
        buildSemanticReviewPayload(execution)
      );
      const status = semanticReviewStatus(review.score, 4);
      return status === item.expectedSemanticStatus;
    });
  }
  if (!results.length) throw new Error('No isolated stage cases selected.');
  return { cases: results.length, passed: results.every((item) => item.passed), results };
}
