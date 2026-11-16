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
 * System action: Record failure without triggering automatic recovery.
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
 * System action: Recovery requires structured evidence that target content is ready and sources broke.
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
  public readonly details: Array<{ field: string; message: string }>;
  public readonly fields: Record<string, string>;

  constructor(
    message: string,
    detailsOrCause?: Array<{ field: string; message: string }> | unknown,
    cause?: unknown
  ) {
    const isDetailsArray = Array.isArray(detailsOrCause);
    const actualCause = isDetailsArray ? cause : detailsOrCause;
    const actualDetails = isDetailsArray
      ? (detailsOrCause as Array<{ field: string; message: string }>)
      : [{ field: 'root', message }];

    super(message, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      isRetryable: false,
      cause: actualCause,
    });

    this.details = actualDetails.length > 0 ? actualDetails : [{ field: 'root', message }];
    this.fields = {};
    for (const d of this.details) {
      if (!this.fields[d.field]) {
        this.fields[d.field] = d.message;
      }
    }
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

export type QuotaType = 'ACTIVE_MONITORS' | 'COMPILATIONS' | 'EXECUTIONS';

export class QuotaExceededError extends DomainError {
  public readonly quotaType: QuotaType;
  public readonly current: number;
  public readonly limit: number;

  constructor(
    message: string,
    options: {
      quotaType: QuotaType;
      current: number;
      limit: number;
      cause?: unknown;
    }
  ) {
    super(message, {
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
