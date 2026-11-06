'use client';
import * as React from 'react';
import { isCollectionPayload, FieldType, type JobRunDto } from '@specter/contracts';
import {
  summarizeRuns,
  fieldObservations,
  orderedRuns,
  TEXT_MODE,
  type TimelineFields,
} from '@/lib/chartUtils';
import { formatDateTime } from '@/lib/utils';
import { formatObservedNumber } from '@/lib/numberFormatting';
import { NumericObservations } from './NumericObservations';
import { StateObservations } from './StateObservations';
import { CollectionHistory } from './CollectionHistory';

interface Props {
  runs: JobRunDto[];
  fields: TimelineFields;
  revision: string | null;
  identityFields: string[];
  timeZone?: string;
}
export function ExecutionTimelineChart({
  runs,
  fields,
  revision,
  identityFields,
  timeZone = 'UTC',
}: Props) {
  const [field, setField] = React.useState(Object.keys(fields)[0] ?? '');
  const [textMode, setTextMode] = React.useState<string>(TEXT_MODE.Events);
  const selected = fields[field] ? field : Object.keys(fields)[0];
  const definition = fields[selected];
  const observations = definition
    ? fieldObservations(runs, selected, definition.type, revision)
    : [];
  const formatTime = (date: string) =>
    Number.isFinite(Date.parse(date)) ? formatDateTime(date, timeZone) : 'Invalid collection date';
  const formatValue = (value: string | number | boolean | null) =>
    definition?.type === FieldType.Number
      ? String(formatObservedNumber(value, definition.locale, definition.displayName || selected))
      : String(value);
  const summary = summarizeRuns(runs);
  const chronological = orderedRuns(runs);
  const dated = chronological.filter((run) => Number.isFinite(Date.parse(run.executedAt)));
  const collection = runs.some(
    (run) =>
      run.contractRevision === revision &&
      run.extractedData &&
      isCollectionPayload(run.extractedData)
  );
  return (
    <div className="space-y-5 text-sm">
      <p>
        {runs.length} recent executions loaded
        {dated.length
          ? ` · ${formatTime(dated[0].executedAt)} — ${formatTime(dated[dated.length - 1].executedAt)}`
          : ''}
        . All summaries refer to this loaded history.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Total runs', summary.total],
          ['Changed runs', summary.changes],
          ['Last observed change', summary.lastChange ? formatTime(summary.lastChange) : 'None'],
          [
            'Average execution duration',
            summary.averageDuration === null ? 'Unavailable' : `${summary.averageDuration} ms`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="border border-border rounded p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div>{value}</div>
          </div>
        ))}
      </div>
      {collection ? (
        <CollectionHistory
          runs={runs}
          revision={revision}
          identityFields={identityFields}
          formatTime={formatTime}
          fields={fields}
        />
      ) : definition ? (
        <section className="rounded-lg border border-border p-4 space-y-4">
          <label className="flex gap-3 items-center">
            Monitored field
            <select
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selected}
              onChange={(e) => {
                setField(e.target.value);
                setTextMode(TEXT_MODE.Events);
              }}
            >
              {Object.entries(fields).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.displayName || key}
                </option>
              ))}
            </select>
          </label>
          {definition.type === FieldType.Number ? (
            <NumericObservations
              key={selected}
              observations={observations}
              formatTime={formatTime}
              formatValue={(value) => formatValue(value)}
            />
          ) : definition.type === FieldType.Boolean ? (
            <StateObservations observations={observations} formatTime={formatTime} boolean />
          ) : (
            <>
              {definition.type === FieldType.String && (
                <label className="flex gap-3">
                  Presentation
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={textMode}
                    onChange={(e) => setTextMode(e.target.value)}
                  >
                    <option value={TEXT_MODE.Events}>Events</option>
                    <option value={TEXT_MODE.States}>States</option>
                  </select>
                </label>
              )}
              {textMode === TEXT_MODE.States ? (
                <StateObservations observations={observations} formatTime={formatTime} />
              ) : null}
            </>
          )}
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-left">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Collection</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Change since last valid reading</th>
                </tr>
              </thead>
              <tbody>
                {[...observations].reverse().map((p) => (
                  <tr key={p.run.id} className="border-t border-border">
                    <td className="px-3 py-2">{formatTime(p.run.executedAt)}</td>
                    <td
                      className={
                        definition.type === FieldType.Number
                          ? 'px-3 py-2 whitespace-nowrap'
                          : 'px-3 py-2 break-words'
                      }
                    >
                      {p.value === null ? 'Unavailable' : formatValue(p.value)}
                    </td>
                    <td className="px-3 py-2">
                      {p.delta !== null
                        ? `${p.delta > 0 ? '+' : ''}${formatValue(p.delta)}${p.percent !== null ? ` (${p.percent.toPrecision(4)}%)` : ''}`
                        : p.changed
                          ? 'Changed'
                          : '—'}
                      {p.value !== null && p.previous && (
                        <div className="text-xs text-muted-foreground">
                          Reference: {formatTime(p.previous.run.executedAt)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p>No field contract available.</p>
      )}
    </div>
  );
}
