import { TriggerOperator } from './constants.js';
import type { Scalar, RecordFilter } from './contracts.js';

export function matchesRecord(record: Record<string, Scalar>, filters: RecordFilter[]): boolean {
  return filters.every(({ field, operator, value }) => {
    const actual = record[field];
    if (actual === null || actual === undefined) return false;
    switch (operator) {
      case TriggerOperator.Equal:
        return actual === value;
      case TriggerOperator.NotEqual:
        return actual !== value;
      case TriggerOperator.Contains:
        return (
          typeof actual === 'string' &&
          typeof value === 'string' &&
          actual.toLowerCase().includes(value.toLowerCase())
        );
      case TriggerOperator.NotContains:
        return (
          typeof actual === 'string' &&
          typeof value === 'string' &&
          !actual.toLowerCase().includes(value.toLowerCase())
        );
      case TriggerOperator.LessThan:
        return typeof actual === 'number' && typeof value === 'number' && actual < value;
      case TriggerOperator.LessThanOrEqual:
        return typeof actual === 'number' && typeof value === 'number' && actual <= value;
      case TriggerOperator.GreaterThan:
        return typeof actual === 'number' && typeof value === 'number' && actual > value;
      case TriggerOperator.GreaterThanOrEqual:
        return typeof actual === 'number' && typeof value === 'number' && actual >= value;
    }
  });
}
