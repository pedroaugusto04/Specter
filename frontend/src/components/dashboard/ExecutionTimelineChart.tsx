'use client';
import * as React from 'react';
import { isCollectionPayload, FieldType, RunStatus, type JobRunDto } from '@specter/contracts';
import {
  summarizeRuns,
  fieldObservations,
  orderedRuns,
  TEXT_MODE,
  type TimelineFields,
} from '@/lib/chartUtils';
import { formatDateTime } from '@/lib/utils';
import { NumericObservations } from './NumericObservations';
import { StateObservations } from './StateObservations';
import { CollectionHistory } from './CollectionHistory';

interface Props {
  runs: JobRunDto[];
  fields: TimelineFields;
  revision: string | null;
  identityFields: string[];
  timeZone?: string;
  onSelectRun?: (run: JobRunDto) => void;
  onOpenScreenshot?: (url: string) => void;
}
export function ExecutionTimelineChart({
  runs,
  fields,
  revision,
  identityFields,
  timeZone = 'UTC',
  onSelectRun,
  onOpenScreenshot,
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
        />
      ) : definition ? (
        <section className="rounded-lg border border-border p-4 space-y-4">
          <label className="flex gap-3 items-center">
            Monitored field
            <select
              className="bg-card border rounded p-2"
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
            />
          ) : definition.type === FieldType.Boolean ? (
            <StateObservations observations={observations} formatTime={formatTime} boolean />
          ) : (
            <>
              {definition.type === FieldType.String && (
                <label className="flex gap-3">
                  Presentation
                  <select
                    className="bg-card border rounded"
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
              ) : (
                <ul className="space-y-2">
                  {observations
                    .filter((p) => p.value !== null && (!p.previous || p.changed))
                    .map((p) => (
                      <li key={p.run.id} className="break-words">
                        {formatTime(p.run.executedAt)}:{' '}
                        {p.previous ? `${String(p.previous.value)} → ` : 'Initial: '}
                        {String(p.value)}
                        {p.previous && (
                          <span className="text-muted-foreground">
                            {' '}
                            (previous reading: {formatTime(p.previous.run.executedAt)})
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
          <div className="overflow-auto">
            <table className="w-full text-left">
              <caption className="text-left py-2">
                Field readings, including unavailable observations
              </caption>
              <thead>
                <tr>
                  <th>Collection</th>
                  <th>Value</th>
                  <th>Change since last valid reading</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((p) => (
                  <tr key={p.run.id} className="border-t border-border">
                    <td className="p-2">{formatTime(p.run.executedAt)}</td>
                    <td
                      className={
                        definition.type === FieldType.Number
                          ? 'p-2 whitespace-nowrap'
                          : 'p-2 break-words'
                      }
                    >
                      {p.value === null ? 'Unavailable' : String(p.value)}
                    </td>
                    <td className="p-2">
                      {p.delta !== null
                        ? `${p.delta > 0 ? '+' : ''}${p.delta}${p.percent !== null ? ` (${p.percent.toPrecision(4)}%)` : ''}`
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
      <section className="space-y-2">
        <h3>Execution history ({runs.length})</h3>
        {[...chronological].reverse().map((run) => (
          <article key={run.id} className="border border-border rounded p-3 space-y-2">
            <div>
              {formatTime(run.executedAt)} · {run.status}
              {run.contractRevision !== revision ? ' · Different contract revision' : ''}
            </div>
            {run.status !== RunStatus.Success && <p>{run.errorMessage || 'Reading failed'}</p>}
            <div className="flex gap-3">
              <button className="underline" onClick={() => onSelectRun?.(run)}>
                Inspect
              </button>
              {run.screenshotUrl && (
                <button
                  className="underline"
                  onClick={() => onOpenScreenshot?.(run.screenshotUrl!)}
                >
                  Screenshot
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
