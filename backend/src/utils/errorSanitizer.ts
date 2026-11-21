import { USER_FAILURES, getUserFailure, parseStructuredUserFailure } from '@specter/contracts';
import { AccessFailure } from '../types/access.js';
import { ExtractionQuality, FailureCode } from '../extraction/constants.js';
import { classifyAccessFailure } from '../acquisition/failure.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import {
  AntiBotBlockedError,
  BrowserCapacityError,
  CompilerTimeoutError,
  CompilerApiRequestError,
  CompilerValidationError,
  DomainError,
  NavigationTimeoutError,
  NotFoundError,
  QuotaExceededError,
  SelectorMismatchError,
  UnauthorizedError,
} from '../errors/domainErrors.js';
import { ConfigurationFailure } from '../extraction/configurationFailure.js';

const USER_ERROR_MESSAGES = Object.fromEntries(
  Object.entries(USER_FAILURES).map(([key, failure]) => [key, failure.description])
) as Record<keyof typeof USER_FAILURES, string>;

function formatConfigurationFailure(error: DomainError): string {
  if (error instanceof ConfigurationFailure && error.semanticReview?.reasons?.length) {
    const reasons = error.semanticReview.reasons.filter(Boolean);
    if (reasons.length > 0) {
      return JSON.stringify({
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
    return JSON.stringify({
      title: 'Required Field Not Found',
      description: `We could not find the '${field}' field on the page with the provided instructions.`,
      nextStep: `Check that '${field}' is visible on the page and clarify your monitoring instructions.`,
    });
  }

  if (/no valid records could be extracted|could not locate target record/i.test(message)) {
    return JSON.stringify({
      title: 'Target Content Not Found',
      description: 'We could not locate the main content or item container on this page.',
      nextStep: 'Check that the page loads the expected content and verify the target URL.',
    });
  }

  if (/ambiguous DOM field source|must be selected unambiguously/i.test(message)) {
    return JSON.stringify({
      title: 'Ambiguous Content Selection',
      description: 'Multiple matching items were found on the page, but single-item monitoring was requested.',
      nextStep: 'Clarify your instructions to specify exactly which item on the page to track.',
    });
  }

  if (/duplicate collection identity/i.test(message)) {
    return JSON.stringify({
      title: 'Duplicate Collection Items',
      description: 'Multiple collection items share identical identifiers on the page.',
      nextStep: 'Ensure the target collection items have distinct visible identifiers or links.',
    });
  }

  return USER_ERROR_MESSAGES.configurationRejected;
}

/** Maps internal exceptions to short user-facing messages without exposing technical details. */
export function formatUserErrorMessage(error: unknown): string {
  if (error instanceof BrowserCapacityError) return USER_ERROR_MESSAGES.resourceUnavailable;
  if (error instanceof QuotaExceededError) return error.message;
  if (error instanceof UnauthorizedError) return error.message;
  if (error instanceof NotFoundError) return 'The requested resource was not found.';
  // Setup deadlines must not be mistaken for website navigation timeouts.
  if (error instanceof CompilerTimeoutError) return USER_ERROR_MESSAGES.setupTimedOut;
  if (error instanceof CompilerApiRequestError)
    return error.statusCode === 429
      ? USER_ERROR_MESSAGES.compilerRateLimited
      : USER_ERROR_MESSAGES.setupUnavailable;
  const accessFailure = classifyAccessFailure(error);
  if (accessFailure === AccessFailure.Blocked || error instanceof AntiBotBlockedError)
    return USER_ERROR_MESSAGES.accessBlocked;
  if (accessFailure === AccessFailure.Timeout || error instanceof NavigationTimeoutError)
    return USER_ERROR_MESSAGES.requestTimedOut;
  if (error instanceof SelectorMismatchError || error instanceof CompilerValidationError)
    return USER_ERROR_MESSAGES.requestedDataUnavailable;
  if (accessFailure === AccessFailure.Transient) return USER_ERROR_MESSAGES.websiteUnavailable;
  if (error instanceof DomainError) {
    switch (error.code) {
      case 'RESPONSE_TOO_LARGE':
        return 'The website response is too large to process safely.';
      case 'UPSTREAM_HTTP_ERROR':
        return USER_ERROR_MESSAGES.websiteUnavailable;
      case 'CONFIGURATION_REJECTED':
      case 'CONFIGURATION_OPERATION_FAILED':
        return formatConfigurationFailure(error);
      case 'DECRYPTION_FAILED':
        return USER_ERROR_MESSAGES.sessionUnavailable;
      case 'UNSUPPORTED_CAPABILITY':
        return USER_ERROR_MESSAGES.unsupported;
      case 'RESOURCE_LEASE_LOST':
        return USER_ERROR_MESSAGES.executionInterrupted;
    }
  }
  return USER_ERROR_MESSAGES.requestFailed;
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
            ? USER_ERROR_MESSAGES.accessBlocked
            : report.failureCode === FailureCode.Timeout
              ? USER_ERROR_MESSAGES.requestTimedOut
              : report.quality === ExtractionQuality.Complete ||
                  report.quality === ExtractionQuality.Empty
                ? 'Optional extraction evidence unavailable.'
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

/** Only approved public copy may cross the API boundary, including for historical records. */
export function presentStoredError(message: string | null): string | null {
  if (!message) return null;
  if (parseStructuredUserFailure(message)) return message;
  return getUserFailure(message).description;
}
