import type { Scalar } from './extraction.js';
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
