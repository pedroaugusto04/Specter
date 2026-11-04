import { JobStatus as JOB_STATUS } from '@specter/contracts';
export {
  ChangeStatus as CHANGE_STATUS,
  ExtractionQuality as EXTRACTION_QUALITY,
  JobStatus as JOB_STATUS,
  RunStatus as RUN_STATUS,
} from '@specter/contracts';
export type { ChangeStatus, ExtractionQuality, JobStatus, RunStatus } from '@specter/contracts';
export const JOB_STATUS_FILTER = {
  All: 'ALL',
  Active: JOB_STATUS.Active,
  Healing: JOB_STATUS.Healing,
  Paused: JOB_STATUS.Paused,
} as const;
