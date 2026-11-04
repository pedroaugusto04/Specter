export const JobStatus = {
  PendingCompilation: 'PENDING_COMPILATION',
  Active: 'ACTIVE',
  Failed: 'FAILED',
  Healing: 'HEALING',
  Paused: 'PAUSED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const RunStatus = { Success: 'SUCCESS', Failed: 'FAILED' } as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const ChangeStatus = { Changed: 'YES', Unchanged: 'NO', Initial: 'INITIAL' } as const;
export type ChangeStatus = (typeof ChangeStatus)[keyof typeof ChangeStatus];

export {
  TriggerMatchMode,
  ExtractionQuality,
  TriggerOperator,
  isAcceptedExtractionQuality,
} from '../extraction/constants.js';

export function parseEnumValue<const T extends Record<string, string>>(
  enumValues: T,
  value: string,
  fieldName: string
): T[keyof T] {
  if (!Object.values(enumValues).includes(value)) {
    throw new Error(`Unexpected ${fieldName} value: ${value}`);
  }
  return value as T[keyof T];
}
