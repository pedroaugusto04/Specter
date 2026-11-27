export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    options: { code: string; statusCode?: number; isRetryable?: boolean; cause?: unknown }
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.isRetryable = options.isRetryable ?? false;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ============================================================================
// Validation & Request Errors (400)
// ============================================================================

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export class ValidationError extends DomainError {
  public readonly details: ValidationErrorDetail[];
  public readonly fields: Record<string, string>;

  constructor(
    message: string,
    detailsOrCause?: ValidationErrorDetail[] | unknown,
    cause?: unknown
  ) {
    const isDetailsArray = Array.isArray(detailsOrCause);
    const actualCause = isDetailsArray ? cause : detailsOrCause;
    const actualDetails = isDetailsArray
      ? (detailsOrCause as ValidationErrorDetail[])
      : [{ field: 'root', message }];

    super(message, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      isRetryable: false,
      cause: actualCause,
    });

    this.details = actualDetails.length > 0 ? actualDetails : [{ field: 'root', message }];
    this.fields = {};
    for (const detail of this.details) {
      if (!this.fields[detail.field]) {
        this.fields[detail.field] = detail.message;
      }
    }
  }
}

export class EmailAlreadyRegisteredError extends ValidationError {
  constructor() {
    const message = 'An account with this email already exists.';
    super(message, [{ field: 'email', message }]);
  }
}

export class MonitorNameAlreadyExistsError extends ValidationError {
  constructor() {
    const message = 'A monitor with this name already exists. Choose a unique name.';
    super(message, [{ field: 'name', message }]);
  }
}

export class InvalidCronExpressionError extends ValidationError {
  constructor(reason: string) {
    super(reason, [{ field: 'cronExpression', message: reason }]);
  }
}

export class InvalidTriggerConfigurationError extends ValidationError {
  constructor(issues: Array<{ message: string }>) {
    super(
      'Invalid trigger configuration.',
      issues.map((issue) => ({ field: 'triggerRules', message: issue.message }))
    );
  }
}

export class EmptySessionCookiesError extends ValidationError {
  constructor() {
    super('At least one cookie is required to sync a session.', [
      { field: 'cookies', message: 'Cookies array cannot be empty.' },
    ]);
  }
}

export class OAuthNotConfiguredError extends ValidationError {
  constructor(missingCallbackUrl = false) {
    super(
      missingCallbackUrl
        ? 'Google OAuth callback URL is not configured.'
        : 'Google Sign-In is not configured on this server.'
    );
  }
}

// ============================================================================
// Authentication & Authorization Errors (401 / 403)
// ============================================================================

export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication required.', cause?: unknown) {
    super(message, {
      code: 'UNAUTHORIZED',
      statusCode: 401,
      isRetryable: false,
      cause,
    });
  }
}

export class AuthenticationRequiredError extends UnauthorizedError {
  constructor() {
    super('Please sign in to continue.');
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Invalid email or password.');
  }
}

export class InvalidSessionError extends UnauthorizedError {
  constructor(reason: 'expired' | 'user_missing' = 'expired') {
    super(
      reason === 'user_missing' ? 'User account no longer exists.' : 'Invalid or expired session.'
    );
  }
}

export class MissingRefreshTokenError extends UnauthorizedError {
  constructor() {
    super('No refresh token provided.');
  }
}

export class OAuthCallbackHostError extends UnauthorizedError {
  constructor(reason: 'invalid' | 'disallowed') {
    super(
      reason === 'disallowed' ? 'OAuth callback host is not allowed.' : 'Invalid OAuth callback host.'
    );
  }
}

export class OAuthStateError extends UnauthorizedError {
  constructor(reason: 'invalid' | 'expired') {
    super(
      reason === 'expired' ? 'Expired or invalid OAuth state.' : 'Invalid OAuth state parameter.'
    );
  }
}

export class OAuthExchangeError extends UnauthorizedError {
  constructor(stage: 'token' | 'access_token' | 'profile' | 'email') {
    const messages: Record<typeof stage, string> = {
      token: 'Failed to exchange Google OAuth authorization code.',
      access_token: 'Google OAuth did not return an access token.',
      profile: 'Failed to fetch user profile from Google.',
      email: 'Google account did not provide a valid email address.',
    };
    super(messages[stage]);
  }
}

export type QuotaType = 'ACTIVE_MONITORS' | 'COMPILATIONS' | 'EXECUTIONS';

function formatQuotaExceededMessage(quotaType: QuotaType, current: number, limit: number): string {
  switch (quotaType) {
    case 'ACTIVE_MONITORS':
      return `Active monitor limit reached (${current}/${limit}). Pause or delete existing monitors to activate more.`;
    case 'COMPILATIONS':
      return `Monthly compilation limit reached (${current}/${limit}). Compilations reset at the start of next month.`;
    case 'EXECUTIONS':
      return `Monthly scrape execution limit reached (${current}/${limit}). Runs will resume next month.`;
  }
}

export class QuotaExceededError extends DomainError {
  public readonly quotaType: QuotaType;
  public readonly current: number;
  public readonly limit: number;

  constructor(options: {
    quotaType: QuotaType;
    current: number;
    limit: number;
    cause?: unknown;
  }) {
    super(formatQuotaExceededMessage(options.quotaType, options.current, options.limit), {
      code: 'QUOTA_EXCEEDED',
      statusCode: 403,
      isRetryable: false,
      cause: options.cause,
    });
    this.quotaType = options.quotaType;
    this.current = options.current;
    this.limit = options.limit;
  }
}

// ============================================================================
// Resource Not Found Errors (404)
// ============================================================================

export class NotFoundError extends DomainError {
  constructor(message = 'The requested resource was not found.', cause?: unknown) {
    super(message, {
      code: 'NOT_FOUND',
      statusCode: 404,
      isRetryable: false,
      cause,
    });
  }
}

export class JobNotFoundError extends NotFoundError {
  constructor(jobId?: string) {
    super(jobId ? `Monitor not found: ${jobId}` : 'Monitor not found.');
  }
}

export class PlanVersionNotFoundError extends NotFoundError {
  constructor(versionNumber: number) {
    super(`Plan version ${versionNumber} not found for this monitor.`);
  }
}

export class UserNotFoundError extends NotFoundError {
  constructor(userId?: string) {
    super(userId ? `User account not found: ${userId}` : 'User account not found.');
  }
}

export class SessionNotFoundError extends NotFoundError {
  constructor() {
    super('Session not found or already deleted.');
  }
}

export class RunNotFoundError extends NotFoundError {
  constructor() {
    super('Execution run not found.');
  }
}

// ============================================================================
// State Conflict Errors (409)
// ============================================================================

export class ConflictError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: 'CONFLICT',
      statusCode: 409,
      isRetryable: false,
      cause,
    });
  }
}

export class CompilationAlreadyInProgressError extends ConflictError {
  constructor(action: 'recompile' | 'rollback' = 'recompile') {
    super(
      action === 'rollback'
        ? 'Cannot restore a version while compilation is in progress.'
        : 'A compilation is already in progress for this monitor.'
    );
  }
}

export class ExtractionRunInProgressError extends ConflictError {
  constructor(action: 'recompile' | 'rollback') {
    super(
      action === 'rollback'
        ? 'Cannot restore a version while an extraction is currently running.'
        : 'Cannot recompile while an extraction is currently running. Please wait for the current run to finish.'
    );
  }
}

export class NoCompilationInProgressError extends ConflictError {
  constructor() {
    super('This monitor does not have a compilation in progress.');
  }
}

export class StaleMonitorStateError extends DomainError {
  constructor() {
    super('Monitor changed during execution; stale snapshot discarded.', {
      code: 'STALE_MONITOR_STATE',
      statusCode: 409,
      isRetryable: false,
    });
  }
}

export class MonitorExecutionInProgressError extends DomainError {
  constructor() {
    super('Monitor execution is already in progress.', {
      code: 'MONITOR_EXECUTION_IN_PROGRESS',
      statusCode: 409,
      isRetryable: true,
    });
  }
}

// ============================================================================
// Integration & Realtime API Errors
// ============================================================================

export class TelegramTestFailedError extends DomainError {
  constructor(message?: string) {
    super(
      message ??
        'Telegram notification is currently unavailable. Please verify your Chat ID or try again later.',
      {
        code: 'TELEGRAM_TEST_FAILED',
        statusCode: 400,
        isRetryable: false,
      }
    );
  }
}

export class WebhookTestFailedError extends DomainError {
  public readonly upstreamStatus?: number;

  constructor(message?: string, upstreamStatus?: number) {
    super(
      message ?? 'Webhook delivery failed. Please verify that the endpoint URL is accessible.',
      {
        code: 'WEBHOOK_TEST_FAILED',
        statusCode: 400,
        isRetryable: false,
      }
    );
    this.upstreamStatus = upstreamStatus;
  }
}

export class RealtimeUnavailableError extends DomainError {
  constructor(cause?: unknown) {
    super('Realtime event stream is temporarily unavailable.', {
      code: 'REALTIME_UNAVAILABLE',
      statusCode: 503,
      isRetryable: true,
      cause,
    });
  }
}

// ============================================================================
// Scraping, Extraction, Compiler & Resource Errors
// ============================================================================

/** A resource budget violation cannot be fixed by retrying or recompiling selectors. */
export class ResponseTooLargeError extends DomainError {
  constructor() {
    super('The website response exceeds the configured download limit.', {
      code: 'RESPONSE_TOO_LARGE',
      statusCode: 422,
    });
  }
}

/** Target website responded with HTTP 403/429 or a WAF/CAPTCHA page. */
export class AntiBotBlockedError extends DomainError {
  public readonly httpStatus: number;

  constructor(message = 'Website access is temporarily blocked.', httpStatus = 403, cause?: unknown) {
    super(message, {
      code: 'ANTI_BOT_BLOCKED',
      statusCode: 422,
      isRetryable: false,
      cause,
    });
    this.httpStatus = httpStatus;
  }
}

/**
 * Thrown when Playwright navigation exceeds the configured timeout (default 30s).
 * System action: Retry with exponential backoff; DO NOT recompile.
 */
export class NavigationTimeoutError extends DomainError {
  constructor(message = 'Navigation timed out.', cause?: unknown) {
    super(message, {
      code: 'NAVIGATION_TIMEOUT',
      statusCode: 504,
      isRetryable: true,
      cause,
    });
  }
}

/**
 * Thrown when HTTP 200 OK is returned, but the current compiled selectors extract no valid fields.
 * System action: Recovery requires structured evidence that target content is ready and sources broke.
 */
export class SelectorMismatchError extends DomainError {
  constructor(message = 'Extraction could not be validated.', cause?: unknown) {
    super(message, {
      code: 'SELECTOR_MISMATCH',
      statusCode: 422,
      isRetryable: false,
      cause,
    });
  }
}

/**
 * Thrown when the AI Compiler CLI subprocess exceeds the dead man's switch timeout (default 90s).
 */
export class CompilerTimeoutError extends DomainError {
  constructor(message = 'Compiler request timed out.', cause?: unknown) {
    super(message, {
      code: 'COMPILER_TIMEOUT',
      statusCode: 504,
      isRetryable: true,
      cause,
    });
  }
}

/** Compiler API request failed. Transient HTTP failures may be retried by the queue. */
export class CompilerApiRequestError extends DomainError {
  constructor(
    statusCode: number | undefined,
    cause?: unknown,
    details?: string,
    public readonly retryAfterMs?: number
  ) {
    const retryable =
      statusCode === undefined || statusCode === 408 || statusCode === 429 || statusCode >= 500;
    const suffix = details ? `: ${details}` : statusCode ? ` (HTTP ${statusCode})` : '';
    super(`Compiler API request failed${suffix}`, {
      code:
        statusCode === 429
          ? 'COMPILER_API_RATE_LIMITED'
          : statusCode === undefined
            ? 'COMPILER_API_UNAVAILABLE'
            : 'COMPILER_API_REJECTED',
      statusCode: statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 502,
      isRetryable: retryable,
      cause,
    });
  }
}

/**
 * Thrown when the AI Compiler produces an invalid schema or fails the pre-activation smoke test.
 */
export class CompilerValidationError extends DomainError {
  constructor(message = 'Compiler output validation failed.', cause?: unknown) {
    super(message, {
      code: 'COMPILER_VALIDATION_FAILED',
      statusCode: 422,
      isRetryable: false,
      cause,
    });
  }
}

export class CompilerOutputTooLargeError extends CompilerValidationError {
  constructor() {
    super('Model output exceeds the configured size limit.');
  }
}

export class UpstreamHttpError extends DomainError {
  constructor(
    public readonly httpStatus: number,
    public readonly retryAfterMs?: number
  ) {
    super(`Target returned HTTP ${httpStatus}; response cannot establish an extraction baseline.`, {
      code: 'UPSTREAM_HTTP_ERROR',
      statusCode: 502,
      isRetryable: httpStatus >= 500 || httpStatus === 408,
    });
  }
}

export class UnsupportedCapabilityError extends DomainError {
  constructor(message: string) {
    super(message, { code: 'UNSUPPORTED_CAPABILITY' });
  }
}

export const ResourceErrorCode = {
  BrowserCapacity: 'BROWSER_CAPACITY_EXHAUSTED',
  LeaseLost: 'RESOURCE_LEASE_LOST',
} as const;

export class BrowserCapacityError extends DomainError {
  constructor() {
    super('Browser capacity is currently in use. Retry later.', {
      code: ResourceErrorCode.BrowserCapacity,
      statusCode: 503,
      isRetryable: true,
    });
  }
}

export class ResourceLeaseLostError extends DomainError {
  constructor() {
    super('Execution lease was lost. Discarding stale results.', {
      code: ResourceErrorCode.LeaseLost,
      isRetryable: true,
    });
  }
}

export const CryptoErrorCode = { Decryption: 'DECRYPTION_FAILED' } as const;

export class DecryptionError extends DomainError {
  constructor(cause?: unknown) {
    super('Stored credentials could not be decrypted.', {
      code: CryptoErrorCode.Decryption,
      cause,
    });
  }
}

// ============================================================================
// Internal Invariant & Persistence Errors (500)
// ============================================================================

export class InvalidRecoveryStateError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: 'INVALID_RECOVERY_STATE',
      statusCode: 500,
      isRetryable: false,
      cause,
    });
  }
}

export class PersistenceError extends DomainError {
  constructor(operation: string, cause?: unknown) {
    super(`Persistence operation failed: ${operation}.`, {
      code: 'PERSISTENCE_ERROR',
      statusCode: 500,
      isRetryable: false,
      cause,
    });
  }
}
