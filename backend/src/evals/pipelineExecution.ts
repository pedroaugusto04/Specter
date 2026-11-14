import { payloadRecords } from '../extraction/comparison.js';
import type { ConfigurationResult } from '../extraction/configuration.js';
import { verdictFromQuality } from './outcomes.js';
import type { EvalExecution } from './runner.js';
import type { EvalVerdict } from './types.js';

export type PipelineJudge = (
  records: Record<string, unknown>[],
  result: ConfigurationResult
) => EvalVerdict;

const SAMPLE_SIZE = 3;

/** Converts a configured pipeline result into an eval execution using a suite-specific oracle. */
export function evaluatePipelineResult(
  result: ConfigurationResult,
  judge: PipelineJudge,
  modelCalls?: number
): EvalExecution {
  const records = payloadRecords(result.execution.data);
  const verdict = verdictFromQuality(result.execution.report.quality) ?? judge(records, result);
  return {
    ...verdict,
    transport: result.plan.strategy.transport,
    mode: result.plan.intent.mode,
    records: records.length,
    semanticScore: result.semanticReview.score ?? undefined,
    ...(modelCalls !== undefined ? { modelCalls } : {}),
    sample: records.slice(0, SAMPLE_SIZE),
  };
}
