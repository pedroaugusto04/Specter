import { compareSnapshots } from '../extraction/comparison.js';
import type { AlertPayload } from '../providers/notifications/notification.interface.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import type { TriggerRule } from '../types/extractionPlan.js';
import type { TriggerMatchMode } from '../types/enums.js';
import type { ExtractedPayload } from '../types/extractor.js';
import { evaluateTriggerRules } from './triggerEvaluator.js';

export interface BuildChangeAlertOptions {
  job: ScrapingJobEntity;
  currentData: ExtractedPayload;
  previousData: ExtractedPayload | null;
  triggerRules?: TriggerRule[];
  triggerMatchMode?: TriggerMatchMode;
  screenshotUrl?: string | null;
  subjectSuffix?: string; // e.g. ' (Self-healing)'
}

/**
 * Pure alert construction: compute identity-aligned diffs and evaluate conditions.
 * Removes duplication across CompilationService and ScrapeExecutionService.
 */
export function buildChangeAlert(options: BuildChangeAlertOptions): AlertPayload | null {
  const {
    job,
    currentData,
    previousData,
    triggerRules,
    triggerMatchMode,
    screenshotUrl,
    subjectSuffix = '',
  } = options;

  if (!previousData) return null;

  const diffSummary = compareSnapshots(
    previousData,
    currentData,
    job.extractionPlan?.intent.identityFields ?? []
  );
  if (!diffSummary.hasChanges) return null;

  const triggerResult = evaluateTriggerRules(
    currentData,
    triggerRules,
    triggerMatchMode,
    previousData,
    job.extractionPlan?.intent.identityFields ?? []
  );

  if (!triggerResult.triggered) return null;

  const changeNoun =
    diffSummary.totalChanges === 1
      ? '1 change detected'
      : `${diffSummary.totalChanges} changes detected`;

  const subject = `[Specter] ${changeNoun}${subjectSuffix}: ${job.url}`;

  return {
    to: job.notificationEmail?.trim() || undefined,
    subject,
    jobId: job.id,
    userId: job.userId,
    targetUrl: job.url,
    userPrompt: job.userPrompt,
    webhookUrl: job.webhookUrl ?? undefined,
    detectedAt: new Date(),
    diffSummary,
    data: currentData,
    triggerReasons: triggerResult.hasRules ? triggerResult.reasons : undefined,
    screenshotUrl: screenshotUrl ?? undefined,
  };
}
