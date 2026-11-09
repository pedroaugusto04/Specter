import * as React from 'react';
import type { JobRunDto } from '@specter/contracts';
import { collectionEvents } from '@/lib/collectionHistory';
import { localizeExtractedPayload, type ExtractionFieldDefinitions } from '@/lib/extractionDisplay';
import { PaginationControls } from '@/components/ui/PaginationControls';

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
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const events = collectionEvents(runs, revision, identityFields);
  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedEvents = events.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
        Collection observations ({events.length})
      </h3>
      {paginatedEvents.map(({ run, reliable, changes }) => (
        <details key={run.id} className="border border-border rounded p-3">
          <summary className="cursor-pointer font-medium text-foreground">
            {formatTime(run.executedAt)} ·{' '}
            {reliable
              ? `${changes.length} changes against previous complete reading (first reading establishes baseline)`
              : 'Comparison unavailable: identity, coverage or contract cannot be verified'}
          </summary>
          {changes.map((change) => (
            <div key={change.identity} className="py-2 break-all text-xs">
              <p className="font-mono font-semibold">
                {change.identity}:{' '}
                {!change.before ? 'Added' : !change.after ? 'Removed' : 'Modified'}
              </p>
              <pre className="overflow-auto mt-1 rounded bg-muted/40 p-2 font-mono">
                {JSON.stringify(
                  localizeExtractedPayload({ previous: change.before, current: change.after }, fields),
                  null,
                  2
                )}
              </pre>
            </div>
          ))}
          <pre className="overflow-auto mt-2 rounded bg-muted/40 p-2 text-xs font-mono">
            {JSON.stringify(localizeExtractedPayload(run.extractedData, fields), null, 2)}
          </pre>
        </details>
      ))}

      {totalPages > 1 && (
        <PaginationControls
          page={safePage}
          totalPages={totalPages}
          totalItems={events.length}
          pageSize={pageSize}
          onPageChange={setPage}
          itemLabel="events"
        />
      )}
    </section>
  );
}
