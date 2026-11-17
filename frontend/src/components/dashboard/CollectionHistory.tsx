import * as React from 'react';
import type { JobRunDto } from '@specter/contracts';
import type { PaginationMeta } from '@specter/contracts';
import { collectionEvents } from '@/lib/collectionHistory';
import { localizeExtractedPayload, type ExtractionFieldDefinitions } from '@/lib/extractionDisplay';
import { PaginationControls } from '@/components/ui/PaginationControls';

export function CollectionHistory({
  runs,
  previousRun,
  pagination,
  pageSize,
  onPageChange,
  revision,
  identityFields,
  formatTime,
  fields,
}: {
  runs: JobRunDto[];
  previousRun: JobRunDto | null;
  pagination?: PaginationMeta;
  pageSize: number;
  onPageChange: (page: number) => void;
  revision: string | null;
  identityFields: string[];
  formatTime: (date: string) => string;
  fields: ExtractionFieldDefinitions;
}) {
  const pageRunIds = new Set(runs.map((run) => run.id));
  const events = collectionEvents(
    [...(previousRun ? [previousRun] : []), ...runs],
    revision,
    identityFields
  ).filter(({ run }) => pageRunIds.has(run.id));

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
        Collection observations ({pagination?.totalItems ?? events.length})
      </h3>
      {events.map(({ run, reliable, changes }) => (
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
                  localizeExtractedPayload(
                    { previous: change.before, current: change.after },
                    fields
                  ),
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

      {pagination && pagination.totalItems > 0 && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pageSize}
          onPageChange={onPageChange}
          itemLabel="events"
        />
      )}
    </section>
  );
}
