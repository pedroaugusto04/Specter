import { EntityChangeKind } from './constants.js';
import type { EntityChange } from './contracts.js';
import type { ExtractedPayload, ExtractedRecord } from '../types/extractor.js';
import { buildDiffSummary } from '../utils/diffHasher.js';
import { recordIdentity } from './values.js';

export function compareSnapshots(
  previous: ExtractedPayload,
  current: ExtractedPayload,
  identityFields: string[]
) {
  const old = new Map(
    payloadRecords(previous).map((record) => [recordIdentity(record, identityFields), record])
  );
  const next = new Map(
    payloadRecords(current).map((record) => [recordIdentity(record, identityFields), record])
  );
  const entityChanges: EntityChange[] = [];
  for (const identity of [...new Set([...old.keys(), ...next.keys()])].sort()) {
    const before = old.get(identity) ?? null;
    const after = next.get(identity) ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    entityChanges.push({
      identity,
      kind:
        before === null
          ? EntityChangeKind.Added
          : after === null
            ? EntityChangeKind.Removed
            : EntityChangeKind.Modified,
      previous: before,
      current: after,
    });
  }
  return {
    ...buildDiffSummary(
      comparisonPayload(previous, identityFields),
      comparisonPayload(current, identityFields)
    ),
    entityChanges,
  };
}

export function comparisonPayload(payload: ExtractedPayload, identityFields: string[]): unknown {
  if (!('items' in payload) || !Array.isArray(payload.items)) return payload;
  return {
    records: Object.fromEntries(
      payload.items.map((record) => [recordIdentity(record, identityFields), record])
    ),
  };
}

export function payloadRecords(payload: ExtractedPayload): ExtractedRecord[] {
  return 'items' in payload && Array.isArray(payload.items)
    ? payload.items
    : [payload as ExtractedRecord];
}
