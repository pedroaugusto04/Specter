import {
  intentInstructions,
  discoveryInstructions,
  strategyInstructions,
  semanticInstructions,
} from './prompts.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
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
function outputInstructions(schema: z.ZodTypeAny, instructions: string): string {
  return `${instructions}\nReturn only a JSON object matching this schema: ${JSON.stringify(zodToJsonSchema(schema, { $refStrategy: 'none' }))}`;
}
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
      interpret: async (input) =>
        extractionIntentSchema.parse(
          await task(
            model,
            input,
            'intent',
            outputInstructions(extractionIntentSchema, intentInstructions)
          )
        ),
    },
    discovery: {
      next: async (input, intent) =>
        discoverySchema.parse(
          await task(
            model,
            input,
            'discovery',
            outputInstructions(discoverySchema, discoveryInstructions),
            { intent }
          )
        ).action,
    },
    generator: {
      generate: async (input, intent, feedback) =>
        executionStrategySchema.parse(
          await task(
            model,
            input,
            'plan',
            outputInstructions(executionStrategySchema, strategyInstructions),
            {
              intent,
              validationFeedback: feedback,
            }
          )
        ),
    },
    reviewer: {
      review: async (input, intent, result) =>
        reviewSchema.parse(
          await task(
            model,
            input,
            'semantic',
            outputInstructions(reviewSchema, semanticInstructions),
            { intent, result }
          )
        ),
    },
  };
}
