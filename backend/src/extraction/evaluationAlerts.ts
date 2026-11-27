import { buildChangeAlert } from '../utils/changeAlertHelper.js';
import { computeExtractionHash } from '../utils/diffHasher.js';
import type { ExtractionPlan, Scalar } from './contracts.js';
import type { ExtractedPayload } from '../types/extractor.js';
import { ExtractionMode } from './constants.js';

export function evaluationPayload(
  plan: ExtractionPlan,
  records: Record<string, Scalar>[]
): ExtractedPayload {
  return plan.intent.mode === ExtractionMode.Single
    ? (records[0] ?? {})
    : { items: records, count: records.length };
}

/** Shared alert contract for offline extraction and configuration evaluations. */
export function evaluationWouldAlert(input: {
  name: string;
  url: string;
  prompt: string;
  plan: ExtractionPlan;
  currentRecords: Record<string, Scalar>[];
  previousRecords?: Record<string, Scalar>[];
}): boolean {
  if (!input.previousRecords) return false;
  const current = evaluationPayload(input.plan, input.currentRecords);
  const previous = evaluationPayload(input.plan, input.previousRecords);
  return (
    computeExtractionHash(previous) !== computeExtractionHash(current) &&
    Boolean(
      buildChangeAlert({
        job: {
          id: input.name,
          userId: 'eval',
          name: input.name,
          url: input.url,
          userPrompt: input.prompt,
          notificationEmail: '',
          webhookUrl: null,
          webhookSecret: null,
          extractionPlan: input.plan,
        },
        currentData: current,
        previousData: previous,
        triggerRules: input.plan.intent.triggerRules,
        triggerMatchMode: input.plan.intent.triggerMatchMode,
      })
    )
  );
}
