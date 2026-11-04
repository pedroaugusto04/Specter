import {
  intentInstructions,
  discoveryInstructions,
  strategyInstructions,
  semanticInstructions,
} from './prompts.js';
import { z } from 'zod';
import type { ConfigurationStages, IModelProvider, StageInput } from './model.js';
import {
  discoveryActionSchema,
  executionStrategySchema,
  extractionIntentSchema,
} from '../types/extractionPlan.js';
import { redactObject, redactText } from './evidence.js';
const discoverySchema = z
  .object({
    action: discoveryActionSchema.nullable(),
  })
  .strict();
const reviewSchema = z
  .object({
    score: z.number().int().min(0).max(10),
    reasons: z.array(z.string().min(1)).min(1),
    evidenceRefs: z.array(z.string().min(1)).min(1),
  })
  .strict();
function task(
  model: IModelProvider,
  input: StageInput,
  kind: 'intent' | 'discovery' | 'plan' | 'semantic',
  instructions: string,
  extra: unknown = {}
) {
  return model.generate({
    jobId: input.jobId,
    task: kind,
    timeoutMs: input.timeoutMs,
    instructions,
    evidence: JSON.stringify({
      userRequest: redactText(input.prompt, 10000),
      url: redactText(input.url),
      pageEvidence: redactText(input.evidence, input.evidence.length),
      context: redactObject(extra),
    }),
  });
}
/** Each stage can be replaced separately, even when they share the same model transport. */
export function createModelStages(model: IModelProvider): ConfigurationStages {
  return {
    interpreter: {
      interpret: async (input) =>
        extractionIntentSchema.parse(await task(model, input, 'intent', intentInstructions)),
    },
    discovery: {
      next: async (input, intent) =>
        discoverySchema.parse(
          await task(model, input, 'discovery', discoveryInstructions, { intent })
        ).action,
    },
    generator: {
      generate: async (input, intent, feedback) =>
        executionStrategySchema.parse(
          await task(model, input, 'plan', strategyInstructions, {
            intent,
            validationFeedback: feedback,
          })
        ),
    },
    reviewer: {
      review: async (input, intent, result) =>
        reviewSchema.parse(
          await task(model, input, 'semantic', semanticInstructions, { intent, result })
        ),
    },
  };
}
