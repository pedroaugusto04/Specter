import type { INotificationProvider } from '../providers/notifications/notification.interface.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import type { ExtractedPayload, TriggerRule } from '../types/extractor.js';
import { buildDiffSummary } from './diffHasher.js';
import { logger } from './logger.js';
import { evaluateTriggerRules } from './triggerEvaluator.js';

export interface DispatchChangeAlertOptions {
  job: ScrapingJobEntity;
  currentData: ExtractedPayload;
  previousData: ExtractedPayload | null;
  triggerRules?: TriggerRule[];
  triggerMatchMode?: 'any' | 'all';
  notificationProvider: INotificationProvider;
  screenshotUrl?: string | null;
  subjectSuffix?: string; // e.g. ' (Self-healing)'
}

/**
 * Cohesive helper to compute diffs, evaluate trigger conditions, and dispatch change notifications.
 * Removes duplication across CompilationService and ScrapeExecutionService.
 */
export async function evaluateAndDispatchChangeAlert(
  options: DispatchChangeAlertOptions
): Promise<void> {
  const {
    job,
    currentData,
    previousData,
    triggerRules,
    triggerMatchMode,
    notificationProvider,
    screenshotUrl,
    subjectSuffix = '',
  } = options;

  if (!previousData) return;

  const diffSummary = buildDiffSummary(previousData, currentData);
  if (!diffSummary.hasChanges) return;

  const triggerResult = evaluateTriggerRules(
    currentData,
    triggerRules,
    triggerMatchMode,
    previousData
  );

  if (!triggerResult.triggered) {
    logger.info(
      `Change detected${subjectSuffix ? subjectSuffix : ''} but notification suppressed because trigger conditions were not met`,
      {
        jobId: job.id,
        reasons: triggerResult.reasons,
      }
    );
    return;
  }

  const changeNoun =
    diffSummary.totalChanges === 1
      ? '1 change detected'
      : `${diffSummary.totalChanges} changes detected`;

  const subject = `[Specter] ${changeNoun}${subjectSuffix}: ${job.url}`;

  await notificationProvider
    .sendAlert({
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
    })
    .catch((notifyErr) => {
      logger.warn('Failed to send notification alert', {
        jobId: job.id,
        errorMessage: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    });
}
