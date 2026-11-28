import { RunPhase, USER_FAILURES } from '@specter/contracts';
import type { CreateJobRunInput } from '../repositories/jobRepository.js';
import type { JobRunEntity, ScrapingJobEntity } from '../types/domain.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import type { RunMetadata } from '../types/run.js';
import { ChangeStatus, ExtractionQuality, RunStatus } from '../types/enums.js';
import { ConfigurationFailure } from '../extraction/configurationFailure.js';
import { ExtractionFailureReason, FailureCode, TraceStatus } from '../extraction/constants.js';

export function initialRunMetadata(): RunMetadata {
  return {
    accessAttempts: 0,
    confirmations: 0,
    recoveryAttempts: 0,
    compilationAttempts: 0,
    reasons: [],
  };
}

export function cloneRunMetadata(metadata: RunMetadata): RunMetadata {
  return {
    ...metadata,
    reasons: [...metadata.reasons],
  };
}

export function buildCancelledRunPatch() {
  return {
    status: RunStatus.Cancelled,
    completedAt: new Date(),
    nextAttemptAt: null,
    phase: null,
  };
}

export function buildBeginRunValues(job: ScrapingJobEntity, originQueueId: string) {
  return {
    jobId: job.id,
    originQueueId,
    status: RunStatus.Running,
    hasChanges: ChangeStatus.Unchanged,
    phase: RunPhase.Checking,
    startedAt: new Date(),
    monitorUpdatedAt: job.updatedAt,
    metadata: initialRunMetadata(),
  };
}

export function buildAttemptStartRun(run: JobRunEntity): {
  input: CreateJobRunInput;
  metadata: RunMetadata;
} {
  const metadata = cloneRunMetadata(run.metadata!);
  metadata.accessAttempts += 1;
  return {
    metadata,
    input: {
      ...run,
      phase: metadata.confirmations ? RunPhase.Confirming : RunPhase.Checking,
      nextAttemptAt: null,
      metadata,
    },
  };
}

export function buildChargeExecutionRun(
  run: JobRunEntity,
  currentMetadata: RunMetadata
): { input: CreateJobRunInput; metadata: RunMetadata } {
  const metadata = cloneRunMetadata(currentMetadata);
  metadata.executionCharged = true;
  return {
    metadata,
    input: {
      ...run,
      metadata,
      chargeUsage: 'execution',
    },
  };
}

export function buildRecoveryCompilationAttemptRun(run: JobRunEntity): {
  input: CreateJobRunInput;
  metadata: RunMetadata;
} {
  const metadata = cloneRunMetadata(run.metadata!);
  metadata.compilationAttempts += 1;
  return {
    metadata,
    input: {
      ...run,
      metadata,
    },
  };
}

export function buildStartRecoveryRun(
  run: JobRunEntity,
  currentMetadata: RunMetadata,
  report: ExtractionReport | undefined,
  reason: string
): CreateJobRunInput {
  const metadata = cloneRunMetadata(currentMetadata);
  metadata.reasons.push(reason);
  metadata.recoveryAttempts += 1;
  return {
    ...run,
    extractionReport: report ?? null,
    metadata,
    phase: RunPhase.Recovering,
    nextAttemptAt: null,
  };
}

export function buildScheduleRetryRun(
  run: JobRunEntity,
  currentMetadata: RunMetadata,
  report: ExtractionReport | undefined,
  reason: string,
  isConfirmation: boolean,
  nextAttemptAt: Date
): { input: CreateJobRunInput; metadata: RunMetadata } {
  const metadata = cloneRunMetadata(currentMetadata);
  metadata.reasons.push(reason);
  if (isConfirmation) {
    metadata.confirmations += 1;
  }
  return {
    metadata,
    input: {
      ...run,
      extractionReport: report ?? null,
      metadata,
      phase: isConfirmation ? RunPhase.Confirming : RunPhase.Retrying,
      nextAttemptAt,
    },
  };
}

export function buildFailedRunUpdate(
  run: JobRunEntity,
  errorMessage: string,
  overrides?: {
    metadata?: RunMetadata;
    extractionReport?: ExtractionReport | null;
  }
): CreateJobRunInput {
  return {
    ...run,
    ...(overrides?.metadata ? { metadata: overrides.metadata } : {}),
    ...(overrides && 'extractionReport' in overrides
      ? { extractionReport: overrides.extractionReport }
      : {}),
    status: RunStatus.Failed,
    errorMessage,
    durationMs: Date.now() - (run.startedAt?.getTime() ?? Date.now()),
  };
}

export function buildFailedCompilationRun(input: {
  jobId: string;
  error: unknown;
  userMessage: string;
  httpStatus: number | null;
  durationMs: number;
}): CreateJobRunInput {
  return {
    jobId: input.jobId,
    extractedData: null,
    extractionReport:
      input.error instanceof ConfigurationFailure
        ? {
            quality: ExtractionQuality.Invalid,
            scope: 'page',
            pagesVisited: 0,
            issues: [input.userMessage],
            sourcesUsed: {},
            trace: input.error.trace,
            semanticReview: input.error.semanticReview,
          }
        : undefined,
    normalizedHash: null,
    hasChanges: ChangeStatus.Unchanged,
    status: RunStatus.Failed,
    errorMessage: input.userMessage,
    httpStatus: input.httpStatus,
    durationMs: input.durationMs,
  };
}

export function buildSessionExpiredReport(
  scope: ExtractionReport['scope'],
  options?: { pagesVisited?: number; preflight?: boolean }
): ExtractionReport {
  return {
    pagesVisited: options?.pagesVisited ?? 0,
    quality: ExtractionQuality.Invalid,
    failureCode: FailureCode.SessionExpired,
    failureReason: ExtractionFailureReason.MissingRecords,
    issues: [USER_FAILURES.sessionUnavailable.description],
    sourcesUsed: {},
    evidence: [],
    trace: options?.preflight
      ? [
          {
            stage: 'session-validation',
            durationMs: 0,
            status: TraceStatus.Failed,
            code: 'EXPIRED',
          },
        ]
      : [],
    targetReady: false,
    structuralFailure: false,
    validatedSourceRecords: 0,
    scope,
  };
}

export function markReportSessionExpired(report: ExtractionReport): ExtractionReport {
  const description = USER_FAILURES.sessionUnavailable.description;
  return {
    ...report,
    failureCode: FailureCode.SessionExpired,
    issues: report.issues.includes(description) ? report.issues : [description, ...report.issues],
  };
}
