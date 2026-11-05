import type { JobRunDto } from '@specter/contracts';
import { collectionEvents } from '@/lib/collectionHistory';
import { localizeExtractedPayload, type ExtractionFieldDefinitions } from '@/lib/extractionDisplay';
export function CollectionHistory({
  runs,
  revision,
  identityFields,
  formatTime,
  fields,
}: {
  runs: JobRunDto[];
  revision: string | null;
  identityFields: string[];
  formatTime: (date: string) => string;
  fields: ExtractionFieldDefinitions;
}) {
  return (
    <section className="space-y-3">
      <h3>Collection observations</h3>
      {collectionEvents(runs, revision, identityFields).map(({ run, reliable, changes }) => (
        <details key={run.id} className="border border-border rounded p-3">
          <summary>
            {formatTime(run.executedAt)} ·{' '}
            {reliable
              ? `${changes.length} changes against previous complete reading (first reading establishes baseline)`
              : 'Comparison unavailable: identity, coverage or contract cannot be verified'}
          </summary>
          {changes.map((change) => (
            <div key={change.identity} className="py-2 break-all">
              <p>
                {change.identity}:{' '}
                {!change.before ? 'Added' : !change.after ? 'Removed' : 'Modified'}
              </p>
              <pre className="overflow-auto">
                {JSON.stringify(
                  localizeExtractedPayload({ previous: change.before, current: change.after }, fields),
                  null,
                  2
                )}
              </pre>
            </div>
          ))}
          <pre className="overflow-auto">
            {JSON.stringify(localizeExtractedPayload(run.extractedData, fields), null, 2)}
          </pre>
        </details>
      ))}
    </section>
  );
}
