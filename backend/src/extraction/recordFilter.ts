import type { Scalar, RecordFilter } from './contracts.js';
export function matchesRecord(record: Record<string, Scalar>, filters: RecordFilter[]): boolean {
  return filters.every(({ field, operator, value }) => {
    const actual = record[field];
    if (actual === null || actual === undefined) return false;
    switch (operator) {
      case 'eq':
        return actual === value;
      case 'neq':
        return actual !== value;
      case 'contains':
        return typeof actual === 'string' && typeof value === 'string' && actual.includes(value);
      case 'not_contains':
        return typeof actual === 'string' && typeof value === 'string' && !actual.includes(value);
      case 'lt':
        return typeof actual === 'number' && typeof value === 'number' && actual < value;
      case 'lte':
        return typeof actual === 'number' && typeof value === 'number' && actual <= value;
      case 'gt':
        return typeof actual === 'number' && typeof value === 'number' && actual > value;
      case 'gte':
        return typeof actual === 'number' && typeof value === 'number' && actual >= value;
    }
  });
}
