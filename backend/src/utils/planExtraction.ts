import type { ExtractedPayload } from '../types/extractor.js';
import { recordIdentity } from '../extraction/values.js';
export { convertFieldValue, recordIdentity } from '../extraction/values.js';
export function comparisonPayload(payload: ExtractedPayload, identityFields: string[]): unknown {
  if (!('items' in payload) || !Array.isArray(payload.items)) return payload;
  return {
    records: Object.fromEntries(
      payload.items.map((record) => [recordIdentity(record, identityFields), record])
    ),
  };
}
