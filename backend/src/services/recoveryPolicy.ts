import { ExtractionFailureReason, FailureCode } from '../extraction/constants.js';
import { classifyAccessFailure, classifyReportFailure } from '../acquisition/failure.js';
import { AccessFailure } from '../types/access.js';
import { ExtractionQuality, isAcceptedExtractionQuality } from '../types/enums.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import type { RunMetadata } from '../types/run.js';

export const RecoveryDecision = {
  Accept: 'ACCEPT',
  Retry: 'RETRY',
  Confirm: 'CONFIRM',
  Recompile: 'RECOMPILE',
  Fail: 'FAIL',
} as const;
export type RecoveryDecision = (typeof RecoveryDecision)[keyof typeof RecoveryDecision];
/** Decisions depend on typed evidence, never diagnostic message text. */
export function decideRecovery(input: {
  report?: ExtractionReport;
  error?: unknown;
  metadata: RunMetadata;
  maxAccessAttempts: number;
}): RecoveryDecision {
  const { report, error, metadata, maxAccessAttempts } = input;
  const access = error
    ? classifyAccessFailure(error)
    : report
      ? classifyReportFailure(report)
      : undefined;
  if (access === AccessFailure.Blocked) return RecoveryDecision.Fail;
  if (report?.failureCode === FailureCode.SessionExpired) return RecoveryDecision.Fail;
  if (access === AccessFailure.Timeout || access === AccessFailure.Transient)
    return metadata.accessAttempts < maxAccessAttempts
      ? RecoveryDecision.Retry
      : RecoveryDecision.Fail;
  if (error || !report) return RecoveryDecision.Fail;
  if (isAcceptedExtractionQuality(report.quality)) return RecoveryDecision.Accept;
  if (report.targetReady && report.structuralFailure)
    return metadata.recoveryAttempts === 0 ? RecoveryDecision.Recompile : RecoveryDecision.Fail;
  if (
    report.failureReason === ExtractionFailureReason.MissingRecords ||
    report.quality === ExtractionQuality.Inconclusive ||
    report.failureCode === FailureCode.Readiness ||
    report.failureCode === FailureCode.NoProgress
  )
    return metadata.confirmations === 0 ? RecoveryDecision.Confirm : RecoveryDecision.Fail;
  return RecoveryDecision.Fail;
}
