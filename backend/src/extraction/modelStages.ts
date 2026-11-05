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
import { logger } from '../utils/logger.js';
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
async function task(
  model: IModelProvider,
  input: StageInput,
  kind: 'intent' | 'discovery' | 'plan' | 'semantic',
  instructions: string,
  extra: unknown = {}
) {
  const started = Date.now();
  const request = {
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
  } as const;
  try {
    const result = await model.generate(request);
    logger.info('Model task completed', {
      jobId: input.jobId,
      provider: model.name,
      task: kind,
      durationMs: Date.now() - started,
      status: 'SUCCESS',
    });
    return result;
  } catch (error) {
    logger.warn('Model task failed', {
      jobId: input.jobId,
      provider: model.name,
      task: kind,
      durationMs: Date.now() - started,
      status: 'FAILED',
      errorCode:
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'MODEL_TASK_FAILED',
    });
    throw error;
  }
}
/** Each stage can be replaced separately, even when they share the same model transport. */
export function createModelStages(model: IModelProvider): ConfigurationStages {
  return {
    interpreter: {
      interpret: async (input) => {
        const result = await task(model, input, 'intent', intentInstructions);
        // Some providers wrap the requested object in a top-level `intent` key.
        // Accept that shape while keeping the intent schema itself strict.
        const candidate =
          result && typeof result === 'object' && 'intent' in result
            ? result.intent
            : result;
        return extractionIntentSchema.parse(candidate);
      },
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
