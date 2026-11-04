export const TriggerMatchMode = Object.freeze(/** @type {const} */ ({ All: 'all', Any: 'any' }));

export const ExtractionQuality = Object.freeze(
  /** @type {const} */ ({
    Complete: 'COMPLETE',
    Empty: 'EMPTY',
    Partial: 'PARTIAL',
    Blocked: 'BLOCKED',
    Invalid: 'INVALID',
    Inconclusive: 'INCONCLUSIVE',
  })
);

export const TriggerOperator = Object.freeze(
  /** @type {const} */ ({
    LessThan: 'lt',
    LessThanOrEqual: 'lte',
    GreaterThan: 'gt',
    GreaterThanOrEqual: 'gte',
    Equal: 'eq',
    NotEqual: 'neq',
    Contains: 'contains',
    NotContains: 'not_contains',
    PercentageDrop: 'percentage_drop',
    PercentageIncrease: 'percentage_increase',
    Decreased: 'decreased',
    Increased: 'increased',
    Changes: 'changes',
  })
);

export const ExtractionMode = Object.freeze(
  /** @type {const} */ ({ Single: 'single', Collection: 'collection' })
);

export const ExtractionScope = Object.freeze(
  /** @type {const} */ ({ Page: 'page', Collection: 'collection' })
);

export const SourceKind = Object.freeze(
  /** @type {const} */ ({ Dom: 'dom', JsonLd: 'jsonld', Response: 'response' })
);

export const Transport = Object.freeze(/** @type {const} */ ({ Http: 'http', Browser: 'browser' }));

export const FieldType = Object.freeze(
  /** @type {const} */ ({
    String: 'string',
    Number: 'number',
    Boolean: 'boolean',
    Date: 'date',
    Url: 'url',
  })
);

export const SemanticReviewStatus = Object.freeze(
  /** @type {const} */ ({
    Passed: 'PASSED',
    Warning: 'WARNING',
    Rejected: 'REJECTED',
    Error: 'ERROR',
    Skipped: 'SKIPPED',
  })
);

export const FailureCode = Object.freeze(
  /** @type {const} */ ({
    Limit: 'LIMIT',
    NoProgress: 'NO_PROGRESS',
    Readiness: 'READINESS',
    Source: 'SOURCE',
    Navigation: 'NAVIGATION',
    Timeout: 'TIMEOUT',
  })
);

export const TraceStatus = Object.freeze(
  /** @type {const} */ ({ Success: 'SUCCESS', Failed: 'FAILED', Skipped: 'SKIPPED' })
);

export const EntityChangeKind = Object.freeze(
  /** @type {const} */ ({
    Added: 'ADDED',
    Modified: 'MODIFIED',
    Removed: 'REMOVED',
  })
);

export const JobStatus = Object.freeze(
  /** @type {const} */ ({
    PendingCompilation: 'PENDING_COMPILATION',
    Active: 'ACTIVE',
    Failed: 'FAILED',
    Healing: 'HEALING',
    Paused: 'PAUSED',
  })
);

export const RunStatus = Object.freeze(
  /** @type {const} */ ({ Success: 'SUCCESS', Failed: 'FAILED' })
);

export const ChangeStatus = Object.freeze(
  /** @type {const} */ ({ Changed: 'YES', Unchanged: 'NO', Initial: 'INITIAL' })
);

export const AccessFailure = Object.freeze(
  /** @type {const} */ ({
    Blocked: 'BLOCKED',
    Timeout: 'TIMEOUT',
    Transient: 'TRANSIENT',
    Provider: 'PROVIDER',
  })
);

export const AcquisitionOutcome = Object.freeze(
  /** @type {const} */ ({ Accepted: 'ACCEPTED', Rejected: 'REJECTED' })
);
/** @param {string} quality */
export function isAcceptedExtractionQuality(quality) {
  return quality === ExtractionQuality.Complete || quality === ExtractionQuality.Empty;
}
