import type { DocumentSnapshot } from './contracts.js';
import type { ConfigurationEvaluationCase } from './configurationEvaluation.js';
import { fixtureExecutor } from './configurationEvaluation.js';
import type { IModelProvider, StageInput } from './model.js';
import { createModelStages } from './modelStages.js';
import { extractionPlanSchema } from '../types/extractionPlan.js';
import { buildCompilerEvidence } from '../utils/compilerEvidence.js';
import { redactObject } from './evidence.js';
import { sortObjectKeys } from '../utils/diffHasher.js';

const equal = (a: unknown, b: unknown) =>
  JSON.stringify(sortObjectKeys(a)) === JSON.stringify(sortObjectKeys(b));

function evidence(snapshot: DocumentSnapshot) {
  return (
    buildCompilerEvidence(snapshot.html, 5000) +
    '\nObserved responses: ' +
    JSON.stringify(redactObject(snapshot.responses))
  );
}

/** Gold inputs isolate errors: generator/reviewer do not consume interpreter output. */
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
    const intent = item.expectedIntent;
    const input: StageInput = {
      jobId: 'isolated-' + item.name,
      url: item.snapshot.url,
      prompt: item.prompt,
      evidence: evidence(item.snapshot),
      timeoutMs: 10000,
    };
    const evaluate = async (stage: string, action: () => Promise<boolean>) => {
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
    // Each call receives a fresh provider, independent of preceding stage results.
    await evaluate('intent', async () =>
      equal(await createModelStages(provider(item)).interpreter.interpret(input), intent)
    );
    await evaluate('discovery', async () =>
      equal(
        await createModelStages(provider(item)).discovery.next(input, intent),
        item.interactions?.[0]?.action ?? null
      )
    );
    const observed = item.interactions?.at(-1)?.snapshot ?? item.snapshot;
    const discoveredInput = {
      ...input,
      evidence: evidence(observed),
    };
    await evaluate('plan', async () => {
      const strategy = await createModelStages(provider(item)).generator.generate(
        discoveredInput,
        intent,
        ''
      );
      const plan = extractionPlanSchema.parse({ version: 3, intent, strategy });
      const execution = await fixtureExecutor(item.snapshot, item.interactions).execute(
        item.snapshot.url,
        plan
      );
      const records =
        intent.mode === 'single'
          ? [execution.data]
          : 'items' in execution.data
            ? execution.data.items
            : [];
      return (
        execution.report.quality === item.expectedQuality && equal(records, item.expectedRecords)
      );
    });
    await evaluate('semantic', async () => {
      let status: string;
      try {
        const review = await createModelStages(provider(item)).reviewer.review(
          discoveredInput,
          intent,
          {
            records: item.expectedRecords,
          }
        );
        status = review.score < 4 ? 'REJECTED' : review.score < 7 ? 'WARNING' : 'PASSED';
      } catch {
        status = 'ERROR';
      }
      return status === item.expectedSemanticStatus;
    });
  }
  if (!results.length) throw new Error('No isolated stage cases selected.');
  return { cases: results.length, passed: results.every((item) => item.passed), results };
}
