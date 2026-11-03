export const JOB_STATUS = {
  PendingCompilation: 'PENDING_COMPILATION',
  Active: 'ACTIVE',
  Failed: 'FAILED',
  Healing: 'HEALING',
  Paused: 'PAUSED',
} as const;
export const JOB_STATUS_FILTER = {
  All: 'ALL',
  Active: JOB_STATUS.Active,
  Healing: JOB_STATUS.Healing,
  Paused: JOB_STATUS.Paused,
} as const;

export const RUN_STATUS = { Success: 'SUCCESS', Failed: 'FAILED' } as const;
export const CHANGE_STATUS = { Changed: 'YES', Unchanged: 'NO', Initial: 'INITIAL' } as const;
export const EXTRACTION_QUALITY = {
  Complete: 'COMPLETE',
  Empty: 'EMPTY',
  Partial: 'PARTIAL',
  Blocked: 'BLOCKED',
  Invalid: 'INVALID',
  Inconclusive: 'INCONCLUSIVE',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];
export type ChangeStatus = (typeof CHANGE_STATUS)[keyof typeof CHANGE_STATUS];
export type ExtractionQuality = (typeof EXTRACTION_QUALITY)[keyof typeof EXTRACTION_QUALITY];
