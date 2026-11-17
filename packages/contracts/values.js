import { FieldType, TriggerOperator } from './vocabulary.js';

export const PAGINATION_DEFAULT_PAGE_SIZE = 10;
export const PAGINATION_RUNS_PAGE_SIZE = 20;
export const PAGINATION_TIMESERIES_PAGE_SIZE = 50;
export const PAGINATION_MAX_PAGE_SIZE = 100;
export const PAGINATION_PAGE_SIZE_OPTIONS = Object.freeze([10, 20, 50]);
/** Values have already been normalized by the extraction boundary. */
export function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function recordIdentity(record, fields) {
  return JSON.stringify(fields.map((field) => record[field]));
}
export function sameRecord(left, right) {
  return Object.keys({ ...left, ...right }).every((key) => left[key] === right[key]);
}
export const Coverage = Object.freeze({
  Complete: 'COMPLETE',
  Empty: 'EMPTY',
  Partial: 'PARTIAL',
  Unknown: 'UNKNOWN',
});

export function triggerOperatorsForType(type) {
  const common = [TriggerOperator.Changes, TriggerOperator.Equal, TriggerOperator.NotEqual];
  if (type === FieldType.Number)
    return [
      ...common,
      TriggerOperator.LessThan,
      TriggerOperator.LessThanOrEqual,
      TriggerOperator.GreaterThan,
      TriggerOperator.GreaterThanOrEqual,
      TriggerOperator.Decreased,
      TriggerOperator.Increased,
      TriggerOperator.PercentageDrop,
      TriggerOperator.PercentageIncrease,
    ];
  if (type === FieldType.String)
    return [...common, TriggerOperator.Contains, TriggerOperator.NotContains];
  return common;
}

export function isCollectionPayload(payload) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    Array.isArray(payload.items) &&
    typeof payload.count === 'number'
  );
}
