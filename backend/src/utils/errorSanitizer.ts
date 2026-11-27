import {
  USER_FAILURES,
  formatStructuredUserFailure,
  getUserFailure,
  parseStructuredUserFailure,
} from '@specter/contracts';
import { AccessFailure } from '../types/access.js';
import { ExtractionQuality, FailureCode } from '../extraction/constants.js';
import { classifyAccessFailure } from '../acquisition/failure.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import {
  BrowserCapacityError,
  CompilerApiRequestError,
  CompilerTimeoutError,
  CompilerValidationError,
  DomainError,
  NotFoundError,
  QuotaExceededError,
  SelectorMismatchError,
  UnauthorizedError,
} from '../errors/domainErrors.js';
import { ConfigurationFailure } from '../extraction/configurationFailure.js';

const DOMAIN_CODE_TO_FAILURE: Partial<Record<string, keyof typeof USER_FAILURES>> = {
  RESPONSE_TOO_LARGE: 'responseTooLarge',
  UPSTREAM_HTTP_ERROR: 'websiteUnavailable',
  DECRYPTION_FAILED: 'sessionUnavailable',
  UNSUPPORTED_CAPABILITY: 'unsupported',
  RESOURCE_LEASE_LOST: 'executionInterrupted',
};

function formatConfigurationFailure(error: DomainError): string {
  if (error instanceof ConfigurationFailure && error.semanticReview?.reasons?.length) {
    const reasons = error.semanticReview.reasons.filter(Boolean);
    if (reasons.length > 0) {
      return formatStructuredUserFailure({
        title: 'Extraction Review Not Confirmed',
        description: reasons.join(' '),
        nextStep: 'Clarify your instructions or verify that the target information is shown as expected.',
      });
    }
  }

  const message = error.message;

  const fieldMatch = message.match(/Required field '([^']+)' is missing or invalid/i);
  if (fieldMatch) {
    const field = fieldMatch[1];
    return formatStructuredUserFailure({
      title: 'Required Field Not Found',
      description: `We could not find the '${field}' field on the page with the provided instructions.`,
      nextStep: `Check that '${field}' is visible on the page and clarify your monitoring instructions.`,
    });
  }

  if (/no valid records could be extracted|could not locate target record/i.test(message)) {
    return formatStructuredUserFailure({
      title: 'Target Content Not Found',
      description: 'We could not locate the main content or item container on this page.',
      nextStep: 'Check that the page loads the expected content and verify the target URL.',
    });
  }

  if (/ambiguous DOM field source|must be selected unambiguously/i.test(message)) {
    return formatStructuredUserFailure({
      title: 'Ambiguous Content Selection',
      description: 'Multiple matching items were found on the page, but single-item monitoring was requested.',
      nextStep: 'Clarify your instructions to specify exactly which item on the page to track.',
    });
  }

  if (/duplicate collection identity/i.test(message)) {
    return formatStructuredUserFailure({
      title: 'Duplicate Collection Items',
      description: 'Multiple collection items share identical identifiers on the page.',
      nextStep: 'Ensure the target collection items have distinct visible identifiers or links.',
    });
  }

  return USER_FAILURES.configurationRejected.description;
}

/** Maps internal exceptions to short user-facing messages without exposing technical details. */
export function formatUserErrorMessage(error: unknown): string {
  if (error instanceof BrowserCapacityError) return USER_FAILURES.resourceUnavailable.description;
  if (error instanceof QuotaExceededError || error instanceof UnauthorizedError) {
    return error.message;
  }
  if (error instanceof NotFoundError) return 'The requested resource was not found.';
  // Setup deadlines must not be mistaken for website navigation timeouts.
  if (error instanceof CompilerTimeoutError) return USER_FAILURES.setupTimedOut.description;
  if (error instanceof CompilerApiRequestError) {
    return error.statusCode === 429
      ? USER_FAILURES.compilerRateLimited.description
      : USER_FAILURES.setupUnavailable.description;
  }

  const accessFailure = classifyAccessFailure(error);
  if (accessFailure === AccessFailure.Blocked) return USER_FAILURES.accessBlocked.description;
  if (accessFailure === AccessFailure.Timeout) return USER_FAILURES.requestTimedOut.description;
  if (error instanceof SelectorMismatchError || error instanceof CompilerValidationError) {
    return USER_FAILURES.requestedDataUnavailable.description;
  }
  if (accessFailure === AccessFailure.Transient) return USER_FAILURES.websiteUnavailable.description;

  if (error instanceof DomainError) {
    if (
      error.code === 'CONFIGURATION_REJECTED' ||
      error.code === 'CONFIGURATION_OPERATION_FAILED'
    ) {
      return formatConfigurationFailure(error);
    }
    const mapped = DOMAIN_CODE_TO_FAILURE[error.code];
    if (mapped) return USER_FAILURES[mapped].description;
  }

  return USER_FAILURES.requestFailed.description;
}

export function presentExtractionReport(report: ExtractionReport): ExtractionReport {
  return {
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
            ? USER_FAILURES.accessBlocked.description
            : report.failureCode === FailureCode.Timeout
              ? USER_FAILURES.requestTimedOut.description
              : report.quality === ExtractionQuality.Complete ||
                  report.quality === ExtractionQuality.Empty
                ? 'Optional extraction evidence unavailable.'
                : USER_FAILURES.requestedDataUnavailable.description,
        ]
      : [],
    semanticReview: report.semanticReview
      ? {
          status: report.semanticReview.status,
          score: report.semanticReview.score,
          evidenceRefs: report.semanticReview.evidenceRefs,
          reasons: report.semanticReview.reasons.length
            ? [`Semantic review ${report.semanticReview.status.toLowerCase()}.`]
            : [],
        }
      : undefined,
  };
}

/** Only approved public copy may cross the API boundary, including for historical records. */
export function presentStoredError(message: string | null): string | null {
  if (!message) return null;
  if (parseStructuredUserFailure(message)) return message;
  return getUserFailure(message).description;
}
