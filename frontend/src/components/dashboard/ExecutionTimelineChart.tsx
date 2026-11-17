'use client';
import * as React from 'react';
import {
  isCollectionPayload,
  FieldType,
  PAGINATION_RUNS_PAGE_SIZE,
  type JobRunDto,
  type JobRunsSummaryDto,
  type JobTimeseriesPointDto,
  type PaginationMeta,
} from '@specter/contracts';
import {
  fieldObservations,
  orderedRuns,
  TEXT_MODE,
  type TimelineFields,
  type RunObservationSource,
} from '@/lib/chartUtils';
import { DEFAULT_TIMEZONE, formatDateTime } from '@/lib/utils';
import { formatObservedNumber } from '@/lib/numberFormatting';
import { NumericObservations } from './NumericObservations';
import { StateObservations } from './StateObservations';
import { CollectionHistory } from './CollectionHistory';
import { PaginationControls } from '@/components/ui/PaginationControls';

export type ChartTimeRange = '24h' | '7d' | '30d' | 'all';

interface Props {
  runs?: JobRunDto[];
  previousCollectionRun?: JobRunDto | null;
  runsPagination?: PaginationMeta;
  runsPageSize?: number;
  onRunsPageChange?: (page: number) => void;
  points?: JobTimeseriesPointDto[];
  previousPoint?: JobTimeseriesPointDto | null;
  timeseriesPagination?: PaginationMeta;
  onTimeseriesPageChange?: (page: number) => void;
  onTimeseriesPageSizeChange?: (pageSize: number) => void;
  fields: TimelineFields;
  revision: string | null;
  identityFields: string[];
  timeZone?: string;
  summary: JobRunsSummaryDto;
  timeRange?: ChartTimeRange;
  onTimeRangeChange?: (range: ChartTimeRange) => void;
  isLoading?: boolean;
}
export function ExecutionTimelineChart({
  runs = [],
  previousCollectionRun = null,
  runsPagination,
  runsPageSize = PAGINATION_RUNS_PAGE_SIZE,
  onRunsPageChange,
  points,
  previousPoint = null,
  timeseriesPagination,
  onTimeseriesPageChange,
  onTimeseriesPageSizeChange,
  fields,
  revision,
  identityFields,
  timeZone = DEFAULT_TIMEZONE,
  summary,
  timeRange: controlledTimeRange,
  onTimeRangeChange,
  isLoading = false,
}: Props) {
  const [field, setField] = React.useState(Object.keys(fields)[0] ?? '');
  const [textMode, setTextMode] = React.useState<string>(TEXT_MODE.Events);
  const [internalTimeRange, setInternalTimeRange] = React.useState<ChartTimeRange>('all');

  const timeRange = controlledTimeRange ?? internalTimeRange;

  const handleTimeRangeChange = (val: ChartTimeRange) => {
    setInternalTimeRange(val);
    onTimeRangeChange?.(val);
  };

  const activeRuns: RunObservationSource[] = React.useMemo(() => {
    if (points) return [...(previousPoint ? [previousPoint] : []), ...points];
    if (timeRange === 'all') return runs;
    const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 24 * 7 : 24 * 30;
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return runs.filter((r) => Date.parse(r.executedAt) >= cutoff);
  }, [points, previousPoint, runs, timeRange]);

  const selected = fields[field] ? field : Object.keys(fields)[0];
  const definition = fields[selected];
  const pagePointIds = React.useMemo(
    () => new Set(points ? points.map((point) => point.id) : activeRuns.map((run) => run.id)),
    [activeRuns, points]
  );
  const observations = definition
    ? fieldObservations(activeRuns, selected, definition.type, revision)
    : [];
  const pageObservations = React.useMemo(
    () => observations.filter((observation) => pagePointIds.has(observation.run.id)).reverse(),
    [observations, pagePointIds]
  );
  const formatTime = (date: string) =>
    Number.isFinite(Date.parse(date)) ? formatDateTime(date, timeZone) : 'Invalid collection date';
  const formatValue = (value: string | number | boolean | null) =>
    definition?.type === FieldType.Number
      ? String(formatObservedNumber(value, definition.locale, definition.displayName || selected))
      : String(value);
  const chronological = orderedRuns(activeRuns);
  const dated = chronological.filter((run) => Number.isFinite(Date.parse(run.executedAt)));
  const collection = runs.some(
    (run) =>
      run.contractRevision === revision &&
      run.extractedData &&
      isCollectionPayload(run.extractedData)
  );

  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {summary.totalRuns} total executions (
          {timeseriesPagination?.totalItems ?? activeRuns.length} in range; showing{' '}
          {points?.length ?? activeRuns.length})
          {dated.length
            ? ` · ${formatTime(dated[0].executedAt)} — ${formatTime(dated[dated.length - 1].executedAt)}`
            : ''}
          .
        </p>

        {/* Time range buttons */}
        <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5 text-xs font-mono">
          {(
            [
              ['24h', '24h'],
              ['7d', '7d'],
              ['30d', '30d'],
              ['all', 'All'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => handleTimeRangeChange(val)}
              className={`rounded px-2.5 py-1 transition-colors cursor-pointer ${
                timeRange === val
                  ? 'bg-card text-foreground shadow-2xs font-medium border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Total runs', summary.totalRuns],
          ['Changed runs', summary.changedRuns],
          ['Last observed change', summary.lastChange ? formatTime(summary.lastChange) : 'None'],
          [
            'Average execution duration',
            summary.averageDurationMs === null ? 'Unavailable' : `${summary.averageDurationMs} ms`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="border border-border rounded p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="font-semibold text-foreground">{value}</div>
          </div>
        ))}
      </div>
      {collection ? (
        <CollectionHistory
          runs={runs}
          previousRun={previousCollectionRun}
          pagination={runsPagination}
          pageSize={runsPageSize}
          onPageChange={(page) => onRunsPageChange?.(page)}
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
                {pageObservations.map((p) => (
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
          {timeseriesPagination && timeseriesPagination.totalItems > 0 && (
            <PaginationControls
              page={timeseriesPagination.page}
              totalPages={timeseriesPagination.totalPages}
              totalItems={timeseriesPagination.totalItems}
              pageSize={timeseriesPagination.pageSize}
              onPageChange={(page) => onTimeseriesPageChange?.(page)}
              onPageSizeChange={(pageSize) => onTimeseriesPageSizeChange?.(pageSize)}
              itemLabel="readings"
            />
          )}
        </section>
      ) : (
        <p>No field contract available.</p>
      )}
    </div>
  );
}
