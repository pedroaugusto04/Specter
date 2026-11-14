import { EvalOutcome, type EvalVerdict } from './types.js';

export type FieldKind = 'text' | 'number' | 'url' | 'any';

export interface FieldExpectation {
  /** Accepted record keys (models choose their own names, e.g. `title` or `name`). */
  aliases: string[];
  kind?: FieldKind;
  optional?: boolean;
}

/**
 * Oracle for pages whose exact content cannot be frozen (live websites): it checks
 * structural invariants instead of exact values.
 */
export interface InvariantOracle {
  minRecords?: number;
  maxRecords?: number;
  fields: Record<string, FieldExpectation>;
  /** Fraction of records that must satisfy every required field. Defaults to 0.9. */
  minValidRatio?: number;
}

type EvalRecord = Record<string, unknown>;

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

function resolveKey(
  keys: string[],
  expectation: Pick<FieldExpectation, 'aliases'>
): string | undefined {
  const aliases = expectation.aliases.map(normalizeKey);
  const normalized = keys.map((key) => ({ key, normalized: normalizeKey(key) }));
  return (
    normalized.find((item) => aliases.includes(item.normalized))?.key ??
    normalized.find((item) => aliases.some((alias) => item.normalized.includes(alias)))?.key
  );
}

/** Reads a record value by alias: exact (normalized) key first, then partial key match. */
export function pickField(record: EvalRecord | undefined, ...aliases: string[]): unknown {
  if (!record) return undefined;
  const key = resolveKey(Object.keys(record), { aliases });
  return key === undefined ? undefined : record[key];
}

function isValidValue(value: unknown, kind: FieldKind): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && !value.trim()) return false;
  switch (kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'url':
      return (
        typeof value === 'string' && (/^https?:\/\/\S+$/i.test(value) || value.startsWith('/'))
      );
    case 'text':
      return typeof value === 'string' || typeof value === 'number';
    default:
      return true;
  }
}

export function checkInvariants(records: EvalRecord[], oracle: InvariantOracle): EvalVerdict {
  if (!records.length) return { outcome: EvalOutcome.FalseEmpty, reason: 'No records extracted.' };

  const keys = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const resolved: Array<{ name: string; key: string; kind: FieldKind }> = [];
  for (const [name, expectation] of Object.entries(oracle.fields)) {
    const key = resolveKey(keys, expectation);
    if (key) resolved.push({ name, key, kind: expectation.kind ?? 'any' });
    else if (!expectation.optional)
      return {
        outcome: EvalOutcome.Partial,
        reason: `Missing field "${name}" (extracted keys: ${keys.join(', ') || 'none'}).`,
      };
  }

  if (oracle.minRecords !== undefined && records.length < oracle.minRecords)
    return {
      outcome: EvalOutcome.Partial,
      reason: `Expected at least ${oracle.minRecords} records, got ${records.length}.`,
    };
  if (oracle.maxRecords !== undefined && records.length > oracle.maxRecords)
    return {
      outcome: EvalOutcome.WrongValue,
      reason: `Expected at most ${oracle.maxRecords} records, got ${records.length}.`,
    };

  const required = resolved.filter((field) => !oracle.fields[field.name]?.optional);
  const invalid = records.filter((record) => {
    const recordKeys = Object.keys(record);
    return required.some((field) => {
      // The global key resolved across all records may not exist in this specific record.
      // Try per-record resolution first, then fall back to the global key.
      const localKey = resolveKey(recordKeys, { aliases: oracle.fields[field.name]!.aliases });
      const key = localKey ?? field.key;
      return !isValidValue(record[key], field.kind);
    });
  });
  const validRatio = (records.length - invalid.length) / records.length;
  if (validRatio < (oracle.minValidRatio ?? 0.9))
    return {
      outcome: EvalOutcome.WrongValue,
      reason: `${invalid.length}/${records.length} records violate field invariants, e.g. ${JSON.stringify(invalid[0])}.`,
    };

  return { outcome: EvalOutcome.Correct };
}
