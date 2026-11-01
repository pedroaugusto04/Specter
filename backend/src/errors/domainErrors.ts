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

/**
 * Thrown when target website responds with HTTP 403/429 or WAF/CAPTCHA page.
 * System action: Record failure, DO NOT trigger self-healing recompilation.
 */
export class AntiBotBlockedError extends DomainError {
  public readonly httpStatus: number;

  constructor(message: string, httpStatus = 403, cause?: unknown) {
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
  constructor(message: string, cause?: unknown) {
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
 * System action: Increment failureCount; on 2nd consecutive failure, transition to HEALING.
 */
export class SelectorMismatchError extends DomainError {
  constructor(message: string, cause?: unknown) {
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
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: 'COMPILER_TIMEOUT',
      statusCode: 504,
      isRetryable: true,
      cause,
    });
  }
}

/**
 * Thrown when the AI Compiler produces an invalid schema or fails the pre-activation smoke test.
 */
export class CompilerValidationError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: 'COMPILER_VALIDATION_FAILED',
      statusCode: 422,
      isRetryable: false,
      cause,
    });
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      isRetryable: false,
      cause,
    });
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: 'NOT_FOUND',
      statusCode: 404,
      isRetryable: false,
      cause,
    });
  }
}
