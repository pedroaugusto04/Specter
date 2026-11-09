import { isTimeoutError } from '../utils/networkErrors.js';
import { AccessFailure } from '../types/access.js';
export { AccessFailure };
import { ExtractionQuality, FailureCode } from '../extraction/constants.js';
import type { ExtractionReport } from '../extraction/contracts.js';
import {
  AntiBotBlockedError,
  DomainError,
  NavigationTimeoutError,
  UpstreamHttpError,
} from '../errors/domainErrors.js';

export class AcquisitionFailureError extends DomainError {
  constructor(
    public readonly category: AccessFailure,
    cause: unknown
  ) {
    super('Acquisition alternatives exhausted.', { code: 'ACQUISITION_' + category, cause });
  }
}
export function classifyAccessFailure(error: unknown): AccessFailure | undefined {
  if (error instanceof AcquisitionFailureError) return error.category;
  if (error instanceof AntiBotBlockedError) return AccessFailure.Blocked;
  if (error instanceof NavigationTimeoutError || isTimeoutError(error))
    return AccessFailure.Timeout;
  if (error instanceof UpstreamHttpError && error.isRetryable) return AccessFailure.Transient;
  if (error instanceof Error) {
    const nested = error.cause ? classifyAccessFailure(error.cause) : undefined;
    if (nested) return nested;
    if (
      'code' in error &&
      ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(String(error.code))
    )
      return AccessFailure.Transient;
  }
  return undefined;
}

export function classifyReportFailure(report: ExtractionReport): AccessFailure | undefined {
  if (report.quality === ExtractionQuality.Blocked) return AccessFailure.Blocked;
  if (report.failureCode === FailureCode.Timeout) return AccessFailure.Timeout;
  if (report.failureCode === FailureCode.Navigation) return AccessFailure.Transient;
  return undefined;
}
