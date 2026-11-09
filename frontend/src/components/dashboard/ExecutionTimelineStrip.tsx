'use client';

import { orderedRuns } from '@/lib/chartUtils';
import * as React from 'react';
import type { JobRunDto, JobTimeseriesPointDto } from '@/lib/api';
import { CHANGE_STATUS, RUN_STATUS } from '@/lib/domainValues';
import { formatCompactDate, formatDateTime } from '@/lib/utils';

export type TimelineStripPoint = JobRunDto | JobTimeseriesPointDto;

interface ExecutionTimelineStripProps {
  runs: TimelineStripPoint[];
  timeZone?: string;
  selectedRunId?: string | null;
  onSelectRun?: (run: TimelineStripPoint) => void;
}

export function ExecutionTimelineStrip({
  runs,
  timeZone,
  selectedRunId,
  onSelectRun,
}: ExecutionTimelineStripProps) {
  const [tooltipState, setTooltipState] = React.useState<{
    run: TimelineStripPoint;
    x: number;
    y: number;
    align: 'left' | 'center' | 'right';
  } | null>(null);

  if (runs.length === 0) return null;

  // Chronological order: oldest on left -> newest on right.
  // Take up to the most recent 40 runs to maintain clean visual density.
  const chronologicalRuns = orderedRuns(runs).slice(-40);

  const changeCount = chronologicalRuns.filter(
    (r) => r.hasChanges === CHANGE_STATUS.Changed
  ).length;
  const unchangedCount = chronologicalRuns.filter(
    (r) => r.hasChanges === CHANGE_STATUS.Unchanged && r.status === RUN_STATUS.Success
  ).length;
  const failedCount = chronologicalRuns.filter((r) => r.status === RUN_STATUS.Failed).length;
  const initialCount = chronologicalRuns.filter(
    (r) => r.hasChanges === CHANGE_STATUS.Initial
  ).length;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          Execution sequence — equally spaced observations (Recent {chronologicalRuns.length})
        </span>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-amber-500" />
            Change ({changeCount})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-zinc-300 dark:bg-zinc-700" />
            Unchanged ({unchangedCount})
          </span>
          {initialCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-xs bg-zinc-600 dark:bg-zinc-400" />
              Initial ({initialCount})
            </span>
          )}
          {failedCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-xs bg-red-500" />
              Failed ({failedCount})
            </span>
          )}
        </div>
      </div>

      {/* Timeline Strip */}
      <div className="relative pt-2 pb-1">
        <div className="flex items-center gap-1 h-8 w-full">
          {chronologicalRuns.map((run, index) => {
            const isChange = run.hasChanges === CHANGE_STATUS.Changed;
            const isInitial = run.hasChanges === CHANGE_STATUS.Initial;
            const isFailed = run.status === RUN_STATUS.Failed;
            const isSelected = selectedRunId === run.id;

            let barBg = 'bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700';
            if (isFailed) {
              barBg = 'bg-red-500/90 hover:bg-red-500';
            } else if (isChange) {
              barBg = 'bg-amber-500 hover:bg-amber-400 ring-1 ring-amber-400/50';
            } else if (isInitial) {
              barBg = 'bg-zinc-500 dark:bg-zinc-400 hover:bg-zinc-400';
            }

            return (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelectRun?.(run)}
                onMouseEnter={(e) => {
                  const targetRect = e.currentTarget.getBoundingClientRect();
                  const total = chronologicalRuns.length;
                  const align: 'left' | 'center' | 'right' =
                    index <= 4 ? 'left' : index >= total - 5 ? 'right' : 'center';

                  setTooltipState({
                    run,
                    x:
                      align === 'left'
                        ? targetRect.left
                        : align === 'right'
                          ? targetRect.right
                          : targetRect.left + targetRect.width / 2,
                    y: targetRect.top - 8,
                    align,
                  });
                }}
                onMouseLeave={() => {
                  setTooltipState(null);
                }}
                className={`relative flex-1 h-full rounded-xs transition-all cursor-pointer ${barBg} ${
                  isSelected
                    ? 'ring-2 ring-primary ring-offset-1 ring-offset-background z-10 scale-y-110'
                    : ''
                }`}
                aria-label={`Run at ${run.executedAt}`}
              />
            );
          })}
        </div>

        {/* Viewport Fixed Tooltip (Escapes all drawer & overflow bounds) */}
        {tooltipState && (
          <div
            className={`pointer-events-none fixed z-100 whitespace-nowrap rounded-md border border-border bg-card p-2.5 text-xs font-mono shadow-2xl opacity-100 ring-1 ring-border ${
              tooltipState.align === 'left'
                ? '-translate-y-full'
                : tooltipState.align === 'right'
                  ? '-translate-x-full -translate-y-full'
                  : '-translate-x-1/2 -translate-y-full'
            }`}
            style={{
              left: `${tooltipState.x}px`,
              top: `${tooltipState.y}px`,
            }}
          >
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span>{formatDateTime(tooltipState.run.executedAt, timeZone)}</span>
              <span
                className={`text-[10px] uppercase px-1 py-0.2 rounded font-semibold ${
                  tooltipState.run.status === RUN_STATUS.Failed
                    ? 'bg-red-500/20 text-red-500'
                    : tooltipState.run.hasChanges === CHANGE_STATUS.Changed
                      ? 'bg-amber-500/20 text-amber-500'
                      : tooltipState.run.hasChanges === CHANGE_STATUS.Initial
                        ? 'bg-zinc-500/20 text-foreground'
                        : 'bg-muted text-muted-foreground'
                }`}
              >
                {tooltipState.run.status === RUN_STATUS.Failed
                  ? RUN_STATUS.Failed
                  : tooltipState.run.hasChanges === CHANGE_STATUS.Changed
                    ? 'CHANGE'
                    : tooltipState.run.hasChanges === CHANGE_STATUS.Initial
                      ? 'BASELINE'
                      : 'UNCHANGED'}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              {tooltipState.run.durationMs !== null && <span>{tooltipState.run.durationMs}ms</span>}
              {'httpStatus' in tooltipState.run && tooltipState.run.httpStatus ? (
                <span>HTTP {tooltipState.run.httpStatus}</span>
              ) : null}
              <span className="text-primary underline">Click to inspect</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground/80">
        <span>Oldest ({formatCompactDate(chronologicalRuns[0].executedAt, timeZone)})</span>
        <span>
          Latest (
          {formatCompactDate(chronologicalRuns[chronologicalRuns.length - 1].executedAt, timeZone)})
        </span>
      </div>
    </div>
  );
}
