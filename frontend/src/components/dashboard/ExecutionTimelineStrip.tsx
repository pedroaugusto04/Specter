'use client';

import * as React from 'react';
import type { JobRunDto } from '@/lib/api';
import { formatCompactDate, formatDateTime } from '@/lib/utils';

interface ExecutionTimelineStripProps {
  runs: JobRunDto[];
  timeZone?: string;
  selectedRunId?: string | null;
  onSelectRun?: (run: JobRunDto) => void;
}

export function ExecutionTimelineStrip({
  runs,
  timeZone,
  selectedRunId,
  onSelectRun,
}: ExecutionTimelineStripProps) {
  const [hoveredRun, setHoveredRun] = React.useState<JobRunDto | null>(null);
  const [tooltipPos, setTooltipPos] = React.useState<{ x: number } | null>(null);

  if (runs.length === 0) return null;

  // Chronological order: oldest on left -> newest on right.
  // Take up to the most recent 40 runs to maintain clean visual density.
  const chronologicalRuns = [...runs].reverse().slice(-40);

  const changeCount = runs.filter((r) => r.hasChanges === 'YES').length;
  const unchangedCount = runs.filter((r) => r.hasChanges === 'NO' && r.status === 'SUCCESS').length;
  const failedCount = runs.filter((r) => r.status === 'FAILED').length;
  const initialCount = runs.filter((r) => r.hasChanges === 'INITIAL').length;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          Execution Timeline (Recent {chronologicalRuns.length})
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
          {chronologicalRuns.map((run) => {
            const isChange = run.hasChanges === 'YES';
            const isInitial = run.hasChanges === 'INITIAL';
            const isFailed = run.status === 'FAILED';
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
                  const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                  const targetRect = e.currentTarget.getBoundingClientRect();
                  if (rect) {
                    setTooltipPos({ x: targetRect.left - rect.left + targetRect.width / 2 });
                  }
                  setHoveredRun(run);
                }}
                onMouseLeave={() => {
                  setHoveredRun(null);
                  setTooltipPos(null);
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

        {/* Hover Tooltip */}
        {hoveredRun && tooltipPos && (
          <div
            className="pointer-events-none absolute bottom-12 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card p-2.5 text-xs font-mono shadow-2xl opacity-100 ring-1 ring-border"
            style={{ left: `${tooltipPos.x}px` }}
          >
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span>{formatDateTime(hoveredRun.executedAt, timeZone)}</span>
              <span
                className={`text-[10px] uppercase px-1 py-0.2 rounded font-semibold ${
                  hoveredRun.status === 'FAILED'
                    ? 'bg-red-500/20 text-red-500'
                    : hoveredRun.hasChanges === 'YES'
                      ? 'bg-amber-500/20 text-amber-500'
                      : hoveredRun.hasChanges === 'INITIAL'
                        ? 'bg-zinc-500/20 text-foreground'
                        : 'bg-muted text-muted-foreground'
                }`}
              >
                {hoveredRun.status === 'FAILED'
                  ? 'FAILED'
                  : hoveredRun.hasChanges === 'YES'
                    ? 'CHANGE'
                    : hoveredRun.hasChanges === 'INITIAL'
                      ? 'BASELINE'
                      : 'UNCHANGED'}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              {hoveredRun.durationMs !== null && <span>{hoveredRun.durationMs}ms</span>}
              {hoveredRun.httpStatus && <span>HTTP {hoveredRun.httpStatus}</span>}
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
