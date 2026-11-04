import { AccessFailure } from '../types/access.js';
import { ExtractionQuality, FailureCode } from '../extraction/constants.js';
import { classifyAccessFailure } from '../acquisition/failure.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import {
  AntiBotBlockedError,
  BrowserCapacityError,
  CompilerTimeoutError,
  CompilerValidationError,
  DomainError,
  NavigationTimeoutError,
  SelectorMismatchError,
} from '../errors/domainErrors.js';

const USER_ERROR_MESSAGES = {
  resourceUnavailable: 'Browser capacity is currently in use. Please try again later.',
  accessBlocked:
    'The website is blocking access right now. Try again later or connect an authenticated session.',
  requestTimedOut: 'The website took too long to respond. Please try again later.',
  requestedDataUnavailable:
    'The requested information could not be verified on the page. Check the instructions and try again.',
  setupTimedOut: 'Monitor setup took too long to complete. Please try again.',
  optionalEvidenceUnavailable: 'Optional extraction evidence unavailable.',
  requestFailed: 'We could not complete this request. Please try again later.',
} as const;

/** Maps internal exceptions to short user-facing messages without exposing technical details. */
export function formatUserErrorMessage(error: unknown): string {
  if (error instanceof BrowserCapacityError) return USER_ERROR_MESSAGES.resourceUnavailable;
  const accessFailure = classifyAccessFailure(error);
  if (accessFailure === AccessFailure.Blocked || error instanceof AntiBotBlockedError)
    return USER_ERROR_MESSAGES.accessBlocked;
  if (accessFailure === AccessFailure.Timeout || error instanceof NavigationTimeoutError)
    return USER_ERROR_MESSAGES.requestTimedOut;
  if (error instanceof SelectorMismatchError || error instanceof CompilerValidationError)
    return USER_ERROR_MESSAGES.requestedDataUnavailable;
  if (error instanceof CompilerTimeoutError) return USER_ERROR_MESSAGES.setupTimedOut;
  if (error instanceof DomainError) return USER_ERROR_MESSAGES.requestFailed;
  return USER_ERROR_MESSAGES.requestFailed;
}

export function presentExtractionReport(report: ExtractionReport): ExtractionReport {
  return {
    planRevision: report.planRevision,
    validatedSourceRecords: report.validatedSourceRecords,
    quality: report.quality,
    scope: report.scope,
    pagesVisited: report.pagesVisited,
    sourcesUsed: report.sourcesUsed,
    evidence: report.evidence,
    trace: report.trace?.map((item) => ({
      stage: item.stage,
      durationMs: item.durationMs,
      status: item.status,
      code: item.code,
    })),
    failureCode: report.failureCode,
    integrity: report.integrity,
    coverage: report.coverage,
    issues: report.issues.length
      ? [
          report.quality === ExtractionQuality.Blocked
            ? USER_ERROR_MESSAGES.accessBlocked
            : report.failureCode === FailureCode.Timeout
              ? USER_ERROR_MESSAGES.requestTimedOut
              : report.quality === ExtractionQuality.Complete ||
                  report.quality === ExtractionQuality.Empty
                ? USER_ERROR_MESSAGES.optionalEvidenceUnavailable
                : USER_ERROR_MESSAGES.requestedDataUnavailable,
        ]
      : [],
    semanticReview: report.semanticReview
      ? {
          status: report.semanticReview.status,
          score: report.semanticReview.score,
          evidenceRefs: report.semanticReview.evidenceRefs,
          reasons: report.semanticReview.reasons.length
            ? ['Semantic review ' + report.semanticReview.status.toLowerCase() + '.']
            : [],
        }
      : undefined,
  };
}
