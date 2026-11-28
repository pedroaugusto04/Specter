import { USER_FAILURES } from '@specter/contracts';
import { FailureCode } from '../extraction/constants.js';
import type { AlertDelivery, IAlertRouter } from '../notifications/contracts.js';
import type { FailureAlertPayload } from '../providers/notifications/notification.interface.js';
import type { UpdateJobPatch } from '../repositories/jobRepository.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import { logger } from './logger.js';

export const FAILURE_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export type FailureAlertJob = Pick<
  ScrapingJobEntity,
  | 'id'
  | 'userId'
  | 'name'
  | 'url'
  | 'userPrompt'
  | 'notificationEmail'
  | 'webhookUrl'
  | 'webhookSecret'
  | 'lastFailureAlertAt'
>;

export interface BuildFailureAlertOptions {
  job: FailureAlertJob;
  errorTitle: string;
  errorDescription: string;
  nextStep: string;
  failureCode?: string;
  requiresSessionRenewal?: boolean;
  timezone?: string;
  now?: Date;
}

export interface PrepareTerminalFailureAlertOptions {
  alertRouter?: IAlertRouter;
  job: FailureAlertJob;
  userMessage: string;
  failureCode?: string;
  timezone?: string;
  logContext?: string;
}

export interface PreparedFailureAlert {
  deliveries: AlertDelivery[];
  jobPatch: Partial<UpdateJobPatch>;
}

/**
 * Checks whether a failure alert is eligible to be sent, respecting the 24-hour cooldown.
 */
export function shouldSendFailureAlert(
  job: Pick<ScrapingJobEntity, 'lastFailureAlertAt'>,
  nowMs = Date.now(),
  cooldownMs = FAILURE_ALERT_COOLDOWN_MS
): boolean {
  if (!job.lastFailureAlertAt) return true;
  return nowMs - job.lastFailureAlertAt.getTime() >= cooldownMs;
}

/**
 * Maps a domain failure code into user-facing operational alert copy.
 */
export function resolveFailureAlertCopy(input: {
  failureCode?: string;
  errorDescription: string;
}): {
  errorTitle: string;
  errorDescription: string;
  nextStep: string;
  requiresSessionRenewal: boolean;
} {
  const isSessionExpired = input.failureCode === FailureCode.SessionExpired;
  if (isSessionExpired) {
    return {
      errorTitle: USER_FAILURES.sessionUnavailable.title,
      errorDescription: input.errorDescription,
      nextStep: USER_FAILURES.sessionUnavailable.nextStep,
      requiresSessionRenewal: true,
    };
  }

  const errorTitle =
    input.failureCode === FailureCode.Timeout
      ? USER_FAILURES.requestTimedOut.title
      : USER_FAILURES.requestedDataUnavailable.title;

  return {
    errorTitle,
    errorDescription: input.errorDescription,
    nextStep: USER_FAILURES.requestedDataUnavailable.nextStep,
    requiresSessionRenewal: false,
  };
}

/**
 * Pure builder for terminal monitor failure alerts.
 */
export function buildFailureAlert(options: BuildFailureAlertOptions): FailureAlertPayload {
  const { job, errorTitle, errorDescription, nextStep, failureCode, requiresSessionRenewal, timezone } =
    options;
  const monitorName = job.name.trim() || job.url;
  const detectedAt = options.now ?? new Date();

  return {
    kind: 'failure',
    jobId: job.id,
    userId: job.userId,
    targetUrl: job.url,
    monitorName,
    userPrompt: job.userPrompt,
    to: job.notificationEmail?.trim() || undefined,
    webhookUrl: job.webhookUrl ?? undefined,
    webhookSecret: job.webhookSecret ?? undefined,
    subject: `[Specter] Attention required: ${monitorName}`,
    detectedAt,
    timezone,
    errorTitle,
    errorDescription,
    nextStep,
    failureCode,
    requiresSessionRenewal,
  };
}

/**
 * Centralizes cooldown evaluation, alert payload construction, and outbox delivery preparation
 * for terminal monitor failures across ScrapeExecutionService and CompilationService.
 */
export async function prepareTerminalFailureAlert(
  options: PrepareTerminalFailureAlertOptions
): Promise<PreparedFailureAlert> {
  const { alertRouter, job, userMessage, failureCode, timezone, logContext } = options;
  if (!alertRouter || !shouldSendFailureAlert(job)) {
    return { deliveries: [], jobPatch: {} };
  }

  const copy = resolveFailureAlertCopy({ failureCode, errorDescription: userMessage });
  const failureAlert = buildFailureAlert({
    job,
    ...copy,
    failureCode,
    timezone,
  });

  try {
    const deliveries = await alertRouter.prepare(failureAlert);
    return { deliveries, jobPatch: { lastFailureAlertAt: new Date() } };
  } catch (err) {
    logger.error(logContext ?? 'Failed to prepare terminal failure alert', {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { deliveries: [], jobPatch: {} };
  }
}
