import { env } from '../config/env.js';
import { CompilerValidationError } from '../errors/domainErrors.js';
import { z } from 'zod';
import type { ConfigurationModel, IModelProvider, ModelInput, StageInput } from './model.js';
import { configurationInstructions, semanticInstructions } from './prompts.js';
import {
  configurationDecisionSchema,
  modelConfigurationDecisionSchema,
  semanticVerdictSchema,
} from './configurationSchemas.js';
import { fitEvidenceText } from './evidenceBudget.js';
import { ModelTask } from './configurationConstants.js';
import { redactObject, redactText } from './evidence.js';
import { logger } from '../utils/logger.js';
function outputContract(schema: z.ZodType, instructions: string) {
  const { $schema: _schemaVersion, ...outputSchema } = z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input',
  });
  return {
    instructions: instructions.trim(),
    outputSchema: outputSchema as Record<string, unknown>,
  };
}
async function task(
  model: IModelProvider,
  input: StageInput,
  kind: ModelInput['task'],
  contract: ReturnType<typeof outputContract>,
  extra: unknown = {}
) {
  const started = Date.now();
  const base = {
    userRequest: redactText(input.prompt, input.prompt.length),
    url: redactText(input.url),
    context: redactObject(extra),
  };
  const overhead = contract.instructions.length + JSON.stringify(contract.outputSchema).length;
  const limit = env.CONFIGURATION_MAX_INPUT_CHARS - overhead;
  // Give each diagnostic its own share so page evidence cannot displace it.
  const diagnosticLimit = Math.min(
    8_000,
    Math.floor((limit - JSON.stringify({ ...base, pageEvidence: '' }).length) / 8)
  );
  const diagnostic = (value: unknown): string | undefined => {
    if (value === undefined || diagnosticLimit < 100) return undefined;
    const content =
      typeof value === 'string'
        ? redactText(value, value.length)
        : JSON.stringify(redactObject(value));
    return fitEvidenceText(content, diagnosticLimit, (text) => JSON.stringify(text));
  };
  const diagnostics = {
    feedback: diagnostic(input.feedback || undefined),
    recovery: diagnostic(input.recovery),
    lastRejectedPlan: diagnostic(input.lastRejectedPlan),
  };
  const packet = (evidence: string) =>
    JSON.stringify({ ...base, ...diagnostics, pageEvidence: evidence });
  const evidence = fitEvidenceText(
    redactText(input.evidence, input.evidence.length),
    limit,
    packet
  );
  const request: ModelInput = {
    jobId: input.jobId,
    task: kind,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
    instructions: contract.instructions,
    outputSchema: contract.outputSchema,
    evidence: packet(evidence),
  };
  logger.diagnostic('Model task request', {
    jobId: input.jobId,
    provider: model.name,
    task: kind,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
    request: {
      instructions: request.instructions,
      outputSchema: request.outputSchema,
      evidence: request.evidence,
    },
  });
  try {
    const result = await model.generate(request);
    if (JSON.stringify(result)?.length > env.COMPILER_MAX_OUTPUT_CHARS)
      throw new CompilerValidationError('Model output exceeds the configured size limit.');
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
      errorCode: (error as any)?.code,
    });
    logger.warn('Model task failed', {
      jobId: input.jobId,
      provider: model.name,
      task: kind,
      durationMs: Date.now() - started,
      status: 'FAILED',
      errorCode: (error as any)?.code ?? 'MODEL_TASK_FAILED',
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
      validationIssues: error instanceof z.ZodError ? error.issues : undefined,
    });
    throw error;
  }
}
export function createConfigurationModel(model: IModelProvider): ConfigurationModel {
  return {
    decide: async (input, intent) => {
      const output = await task(
        model,
        input,
        ModelTask.Configure,
        outputContract(modelConfigurationDecisionSchema, configurationInstructions),
        { fixedIntent: intent }
      );
      return validateOutput(input, ModelTask.Configure, output, configurationDecisionSchema);
    },
    review: async (input, intent, result) => {
      const output = await task(
        model,
        input,
        ModelTask.Semantic,
        outputContract(semanticVerdictSchema, semanticInstructions),
        { intent, result }
      );
      return validateOutput(input, ModelTask.Semantic, output, semanticVerdictSchema);
    },
  };
}
