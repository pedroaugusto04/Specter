import type { Scalar } from './extraction.js';
export const PAGINATION_DEFAULT_PAGE_SIZE: 10;
export const PAGINATION_RUNS_PAGE_SIZE: 20;
export const PAGINATION_TIMESERIES_PAGE_SIZE: 50;
export const PAGINATION_MAX_PAGE_SIZE: 100;
export const PAGINATION_PAGE_SIZE_OPTIONS: readonly [10, 20, 50];
export function finiteNumber(value: unknown): number | null;
export function recordIdentity(record: Record<string, Scalar>, fields: string[]): string;
export function sameRecord(left: Record<string, Scalar>, right: Record<string, Scalar>): boolean;
export const Coverage: Readonly<{
  Complete: 'COMPLETE';
  Empty: 'EMPTY';
  Partial: 'PARTIAL';
  Unknown: 'UNKNOWN';
}>;

export function triggerOperatorsForType(
  type: import('./vocabulary.js').FieldType
): import('./vocabulary.js').TriggerOperator[];
export function isCollectionPayload(
  payload: unknown
): payload is { items: import('./payload.js').ExtractedRecord[]; count: number };
