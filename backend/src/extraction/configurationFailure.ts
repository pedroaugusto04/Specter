import { DomainError } from '../errors/domainErrors.js';
import type { SemanticReview, StageTrace } from './contracts.js';
import { ConfigurationErrorCode } from './configurationConstants.js';
export class ConfigurationFailure extends DomainError {
  constructor(
    message: string,
    readonly trace: StageTrace[],
    readonly semanticReview?: SemanticReview
  ) {
    super(message, { code: ConfigurationErrorCode.Rejected, statusCode: 422, isRetryable: false });
  }
}
