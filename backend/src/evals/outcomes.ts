import { AccessFailure, classifyAccessFailure } from '../acquisition/failure.js';
import {
  BrowserCapacityError,
  CompilerApiRequestError,
  CompilerTimeoutError,
  CompilerValidationError,
  DomainError,
  ResourceLeaseLostError,
} from '../errors/domainErrors.js';
import { ConfigurationFailure } from '../extraction/configurationFailure.js';
import { ExtractionQuality, SemanticReviewStatus } from '../extraction/constants.js';
import { UnblockerQuotaExhaustedError } from '../providers/scraping/unblockers/unblocker.interface.js';
import { EvalOutcome, type EvalVerdict } from './types.js';

export interface ClassifiedError extends EvalVerdict {
  errorCode?: string;
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof DomainError) return error.code;
  if (error instanceof Error) return error.name;
  return undefined;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps any thrown error to a single failure reason using the domain error hierarchy. */
export function classifyEvalError(error: unknown): ClassifiedError {
  const base = { reason: message(error), errorCode: errorCode(error) };

  if (error instanceof ConfigurationFailure)
    return {
      ...base,
      outcome:
        error.semanticReview?.status === SemanticReviewStatus.Rejected
          ? EvalOutcome.SemanticRejected
          : EvalOutcome.NoValidPlan,
    };
  if (
    error instanceof BrowserCapacityError ||
    error instanceof ResourceLeaseLostError ||
    error instanceof UnblockerQuotaExhaustedError
  )
    return { ...base, outcome: EvalOutcome.Infra };
  if (
    error instanceof CompilerTimeoutError ||
    error instanceof CompilerApiRequestError ||
    error instanceof CompilerValidationError
  )
    return { ...base, outcome: EvalOutcome.ModelError };

  switch (classifyAccessFailure(error)) {
    case AccessFailure.Blocked:
      return { ...base, outcome: EvalOutcome.Blocked };
    case AccessFailure.Timeout:
      return { ...base, outcome: EvalOutcome.Timeout };
    case AccessFailure.Transient:
      return { ...base, outcome: EvalOutcome.Network };
    case AccessFailure.Provider:
      return { ...base, outcome: EvalOutcome.Infra };
    default:
      return { ...base, outcome: EvalOutcome.Error };
  }
}

/** Maps a non-accepted extraction quality to a failure reason; undefined when accepted. */
export function verdictFromQuality(quality: string): EvalVerdict | undefined {
  switch (quality) {
    case ExtractionQuality.Complete:
      return undefined;
    case ExtractionQuality.Blocked:
      return { outcome: EvalOutcome.Blocked, reason: 'Extraction report marked the page as blocked.' };
    case ExtractionQuality.Empty:
      return { outcome: EvalOutcome.FalseEmpty, reason: 'Extraction report is EMPTY.' };
    case ExtractionQuality.Partial:
      return { outcome: EvalOutcome.Partial, reason: 'Extraction report is PARTIAL.' };
    default:
      return { outcome: EvalOutcome.WrongValue, reason: `Extraction report is ${quality}.` };
  }
}
