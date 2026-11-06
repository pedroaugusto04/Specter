import {
  intentInstructions,
  discoveryInstructions,
  strategyInstructions,
  semanticInstructions,
} from './prompts.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ConfigurationStages, IModelProvider, ModelInput, StageInput } from './model.js';
import {
  discoveryActionSchema,
  executionStrategySchema,
  extractionIntentSchema,
} from '../types/extractionPlan.js';
import { redactObject, redactText } from './evidence.js';
import { logger } from '../utils/logger.js';
import { modelDiscoverySchema, modelStrategySchema } from './modelOutputSchemas.js';
const discoverySchema = z
  .object({
    action: discoveryActionSchema.nullable(),
  })
  .strict()
  .superRefine(({ action }, context) => {
    if (action?.kind === 'wait' && action.condition.kind === 'field')
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['action', 'condition'],
        message: 'Discovery waits cannot reference fields before extraction.',
      });
  });
const reviewSchema = z
  .object({
    score: z.number().int().min(0).max(10),
    reasons: z.array(z.string().min(1)).min(1),
    evidenceRefs: z.array(z.string().min(1)).min(1),
  })
  .strict();
function outputContract(schema: z.ZodTypeAny, instructions: string) {
  const { $schema: _schemaVersion, ...outputSchema } = zodToJsonSchema(schema, {
    $refStrategy: 'none',
  });
  return {
    instructions: instructions.trim(),
    outputSchema: outputSchema as Record<string, unknown>,
  };
}
async function task(
  model: IModelProvider,
  input: StageInput,
  kind: 'intent' | 'discovery' | 'plan' | 'semantic',
  contract: ReturnType<typeof outputContract>,
  extra: unknown = {}
) {
  const started = Date.now();
  const request = {
    jobId: input.jobId,
    task: kind,
    timeoutMs: input.timeoutMs,
    instructions: contract.instructions,
    outputSchema: contract.outputSchema,
    evidence: JSON.stringify({
      userRequest: redactText(input.prompt, 10000),
      url: redactText(input.url),
      pageEvidence: redactText(input.evidence, input.evidence.length),
      context: redactObject(extra),
    }),
  } as const;
  logger.diagnostic('Model task request', {
    jobId: input.jobId,
    provider: model.name,
    task: kind,
    timeoutMs: input.timeoutMs,
    request: {
      instructions: request.instructions,
      outputSchema: request.outputSchema,
      evidence: request.evidence,
    },
  });
  try {
    const result = await model.generate(request);
    logger.diagnostic('Model task response', {
      jobId: input.jobId,
      provider: model.name,
      task: kind,
      durationMs: Date.now() - started,
      response: result,
    });
    logger.info('Model task completed', {
      jobId: input.jobId,
      provider: model.name,
      task: kind,
      durationMs: Date.now() - started,
      status: 'SUCCESS',
    });
    return result;
  } catch (error) {
    logger.diagnostic('Model task error details', {
      jobId: input.jobId,
      provider: model.name,
      task: kind,
      durationMs: Date.now() - started,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorCode:
        error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined,
    });
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
function validateOutput<T>(
  input: StageInput,
  kind: ModelInput['task'],
  output: unknown,
  schema: z.ZodType<T>
): T {
  try {
    const parsed = schema.parse(output);
    logger.diagnostic('Model stage output validated', {
      jobId: input.jobId,
      task: kind,
      output: parsed,
    });
    return parsed;
  } catch (error) {
    logger.diagnostic('Model stage output rejected', {
      jobId: input.jobId,
      task: kind,
      output,
      validationError: error instanceof Error ? error.message : String(error),
      validationIssues:
        error && typeof error === 'object' && 'issues' in error ? error.issues : undefined,
    });
    throw error;
  }
}
/** Each stage can be replaced separately, even when they share the same model transport. */
export function createModelStages(model: IModelProvider): ConfigurationStages {
  return {
    interpreter: {
      interpret: async (input) => {
        const output = await task(
          model,
          input,
          'intent',
          outputContract(extractionIntentSchema, intentInstructions)
        );
        return validateOutput(input, 'intent', output, extractionIntentSchema);
      },
    },
    discovery: {
      next: async (input, intent) => {
        const output = await task(
          model,
          input,
          'discovery',
          outputContract(modelDiscoverySchema, discoveryInstructions),
          { intent }
        );
        return validateOutput(input, 'discovery', output, discoverySchema).action;
      },
    },
    generator: {
      generate: async (input, intent, feedback) => {
        const schema =
          intent.scope === 'page'
            ? executionStrategySchema.omit({ pagination: true })
            : executionStrategySchema;
        const modelSchema =
          intent.scope === 'page'
            ? modelStrategySchema.omit({ pagination: true })
            : modelStrategySchema;
        const output = await task(
          model,
          input,
          'plan',
          outputContract(modelSchema, strategyInstructions),
          {
            intent,
            validationFeedback: feedback,
          }
        );
        return validateOutput(input, 'plan', output, schema);
      },
    },
    reviewer: {
      review: async (input, intent, result) => {
        const output = await task(
          model,
          input,
          'semantic',
          outputContract(reviewSchema, semanticInstructions),
          {
            intent,
            result,
          }
        );
        return validateOutput(input, 'semantic', output, reviewSchema);
      },
    },
  };
}
