import type { EntityChange } from './contracts.js';
import type { ExtractedPayload, ExtractedRecord } from '../types/extractor.js';
import { buildDiffSummary } from '../utils/diffHasher.js';
import { comparisonPayload } from '../utils/planExtraction.js';
import { recordIdentity } from './values.js';
export function compareSnapshots(
  previous: ExtractedPayload,
  current: ExtractedPayload,
  identityFields: string[]
) {
  const records = (payload: ExtractedPayload) =>
    'items' in payload && Array.isArray(payload.items)
      ? payload.items
      : [payload as ExtractedRecord];
  const old = new Map(
    records(previous).map((record) => [recordIdentity(record, identityFields), record])
  );
  const next = new Map(
    records(current).map((record) => [recordIdentity(record, identityFields), record])
  );
  const entityChanges: EntityChange[] = [];
  for (const identity of [...new Set([...old.keys(), ...next.keys()])].sort()) {
    const before = old.get(identity) ?? null;
    const after = next.get(identity) ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    entityChanges.push({
      identity,
      kind: before === null ? 'ADDED' : after === null ? 'REMOVED' : 'MODIFIED',
      previous: before,
      current: after,
    });
  }
  return {
    ...buildDiffSummary(
      comparisonPayload(previous, identityFields),
      comparisonPayload(current, identityFields),
      false
    ),
    entityChanges,
  };
}
