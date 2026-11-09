import {
  isCollectionPayload,
  Coverage,
  recordIdentity,
  sameRecord,
  RunStatus,
  type JobRunDto,
  type ExtractedRecord,
} from '@specter/contracts';
import { orderedRuns } from './chartUtils';
export function collectionEvents(
  runs: JobRunDto[],
  revision: string | null,
  identityFields: string[]
) {
  let previous: Map<string, ExtractedRecord> | null = null;
  return orderedRuns(runs).map((run) => {
    const payload = run.extractedData;
    const items = isCollectionPayload(payload) ? payload.items : null;
    const records = items?.map(
      (record) => [recordIdentity(record, identityFields), record] as const
    );
    const next = new Map(records);
    const reliable =
      run.status === RunStatus.Success &&
      (!revision || run.contractRevision === revision) &&
      items !== null &&
      identityFields.length > 0 &&
      (run.extractionReport?.coverage === Coverage.Complete ||
        (run.extractionReport?.coverage === Coverage.Empty && items.length === 0));
    const changes: {
      identity: string;
      before: ExtractedRecord | null;
      after: ExtractedRecord | null;
    }[] = [];
    if (reliable) {
      if (previous)
        for (const identity of new Set([...previous.keys(), ...next.keys()])) {
          const before = previous.get(identity) ?? null,
            after = next.get(identity) ?? null;
          if (!before || !after || !sameRecord(before, after))
            changes.push({ identity, before, after });
        }
      previous = next;
    }
    return { run, reliable, changes };
  });
}
