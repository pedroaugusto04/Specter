/** @param {string} quality */
export function isAcceptedExtractionQuality(quality: string): quality is 'COMPLETE' | 'EMPTY';
export const TriggerMatchMode: Readonly<{
  readonly All: 'all';
  readonly Any: 'any';
}>;
export const ExtractionQuality: Readonly<{
  readonly Complete: 'COMPLETE';
  readonly Empty: 'EMPTY';
  readonly Partial: 'PARTIAL';
  readonly Blocked: 'BLOCKED';
  readonly Invalid: 'INVALID';
  readonly Inconclusive: 'INCONCLUSIVE';
}>;
export const TriggerOperator: Readonly<{
  readonly LessThan: 'lt';
  readonly LessThanOrEqual: 'lte';
  readonly GreaterThan: 'gt';
  readonly GreaterThanOrEqual: 'gte';
  readonly Equal: 'eq';
  readonly NotEqual: 'neq';
  readonly Contains: 'contains';
  readonly NotContains: 'not_contains';
  readonly PercentageDrop: 'percentage_drop';
  readonly PercentageIncrease: 'percentage_increase';
  readonly Decreased: 'decreased';
  readonly Increased: 'increased';
  readonly Changes: 'changes';
}>;
export const ExtractionMode: Readonly<{
  readonly Single: 'single';
  readonly Collection: 'collection';
}>;
export const ExtractionScope: Readonly<{
  readonly Page: 'page';
  readonly Collection: 'collection';
}>;
export const SourceKind: Readonly<{
  readonly Dom: 'dom';
  readonly JsonLd: 'jsonld';
  readonly Response: 'response';
}>;
export const Transport: Readonly<{
  readonly Http: 'http';
  readonly Browser: 'browser';
}>;
export const FieldType: Readonly<{
  readonly String: 'string';
  readonly Number: 'number';
  readonly Boolean: 'boolean';
  readonly Date: 'date';
  readonly Url: 'url';
}>;
export const SemanticReviewStatus: Readonly<{
  readonly Passed: 'PASSED';
  readonly Warning: 'WARNING';
  readonly Rejected: 'REJECTED';
  readonly Error: 'ERROR';
  readonly Skipped: 'SKIPPED';
}>;
export const FailureCode: Readonly<{
  readonly Limit: 'LIMIT';
  readonly NoProgress: 'NO_PROGRESS';
  readonly Readiness: 'READINESS';
  readonly Source: 'SOURCE';
  readonly Navigation: 'NAVIGATION';
  readonly Timeout: 'TIMEOUT';
  readonly SessionExpired: 'SESSION_EXPIRED';
}>;
export const ExtractionFailureReason: Readonly<{
  readonly RequiredField: 'REQUIRED_FIELD';
  readonly AmbiguousSelection: 'AMBIGUOUS_SELECTION';
  readonly Identity: 'IDENTITY';
  readonly MissingRecords: 'MISSING_RECORDS';
  readonly Readiness: 'READINESS';
  readonly Internal: 'INTERNAL';
}>;
export const TraceStatus: Readonly<{
  readonly Success: 'SUCCESS';
  readonly Failed: 'FAILED';
  readonly Skipped: 'SKIPPED';
}>;
export const EntityChangeKind: Readonly<{
  readonly Added: 'ADDED';
  readonly Modified: 'MODIFIED';
  readonly Removed: 'REMOVED';
}>;
export const JobStatus: Readonly<{
  readonly PendingCompilation: 'PENDING_COMPILATION';
  readonly Active: 'ACTIVE';
  readonly Failed: 'FAILED';
  readonly Recovering: 'RECOVERING';
  readonly Paused: 'PAUSED';
}>;
export const RunStatus: Readonly<{
  readonly Running: 'RUNNING';
  readonly Cancelled: 'CANCELLED';
  readonly Success: 'SUCCESS';
  readonly Failed: 'FAILED';
}>;
export const RunPhase: Readonly<{
  readonly Checking: 'CHECKING';
  readonly Retrying: 'RETRYING';
  readonly Confirming: 'CONFIRMING';
  readonly Recovering: 'RECOVERING';
}>;
export const ChangeStatus: Readonly<{
  readonly Changed: 'YES';
  readonly Unchanged: 'NO';
  readonly Initial: 'INITIAL';
}>;
export const AccessFailure: Readonly<{
  readonly Blocked: 'BLOCKED';
  readonly Timeout: 'TIMEOUT';
  readonly Transient: 'TRANSIENT';
  readonly Provider: 'PROVIDER';
}>;
export const AcquisitionOutcome: Readonly<{
  readonly Accepted: 'ACCEPTED';
  readonly Rejected: 'REJECTED';
}>;

export type TriggerMatchMode = (typeof TriggerMatchMode)[keyof typeof TriggerMatchMode];
export type ExtractionQuality = (typeof ExtractionQuality)[keyof typeof ExtractionQuality];
export type TriggerOperator = (typeof TriggerOperator)[keyof typeof TriggerOperator];
export type ExtractionMode = (typeof ExtractionMode)[keyof typeof ExtractionMode];
export type ExtractionScope = (typeof ExtractionScope)[keyof typeof ExtractionScope];
export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];
export type Transport = (typeof Transport)[keyof typeof Transport];
export type FieldType = (typeof FieldType)[keyof typeof FieldType];
export type SemanticReviewStatus = (typeof SemanticReviewStatus)[keyof typeof SemanticReviewStatus];
export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];
export type ExtractionFailureReason =
  (typeof ExtractionFailureReason)[keyof typeof ExtractionFailureReason];
export type TraceStatus = (typeof TraceStatus)[keyof typeof TraceStatus];
export type EntityChangeKind = (typeof EntityChangeKind)[keyof typeof EntityChangeKind];
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];
export type RunPhase = (typeof RunPhase)[keyof typeof RunPhase];
export type ChangeStatus = (typeof ChangeStatus)[keyof typeof ChangeStatus];
export type AccessFailure = (typeof AccessFailure)[keyof typeof AccessFailure];
export type AcquisitionOutcome = (typeof AcquisitionOutcome)[keyof typeof AcquisitionOutcome];
