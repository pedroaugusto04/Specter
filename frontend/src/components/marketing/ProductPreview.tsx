'use client';

import {
  ExecutionTimelineStrip,
  type TimelineStripPoint,
} from '@/components/dashboard/ExecutionTimelineStrip';
import { Badge } from '@/components/ui/badge';
import { ChangeStatus, RunStatus } from '@specter/contracts';
import { ArrowRight, Bell, Globe } from 'lucide-react';
import * as React from 'react';

/**
 * Illustrative, static data for the landing page preview.
 * Fixed values (no Date.now()) keep server and client renders identical.
 */
const PREVIEW_TARGET = {
  name: 'MacBook Air 13" M3',
  host: 'store.example.com',
  field: 'price',
};

const PREVIEW_CHANGE = {
  previous: '$1,099.00',
  current: '$949.00',
  delta: '−13.6%',
  detectedAt: 'Today, 09:15',
};

const PREVIEW_HISTORY = [
  { time: 'Today, 09:15', value: '$949.00', status: 'change' },
  { time: 'Today, 08:15', value: '$1,099.00', status: 'unchanged' },
  { time: 'Today, 07:15', value: '$1,099.00', status: 'unchanged' },
  { time: 'Yesterday, 18:15', value: '$1,099.00', status: 'change' },
  { time: 'Yesterday, 17:15', value: '$1,149.00', status: 'unchanged' },
] as const;

const HISTORY_LABEL: Record<(typeof PREVIEW_HISTORY)[number]['status'], string> = {
  change: 'CHANGE',
  unchanged: 'UNCHANGED',
};

/** Timeline mirrors the history above: hourly checks ending "Today, 09:15" (a change). */
const PREVIEW_RUN_COUNT = 32;
const PREVIEW_INTERVAL_MS = 60 * 60 * 1000;
const PREVIEW_LATEST_MS = Date.UTC(2026, 10, 13, 9, 15, 0);
const PREVIEW_START_MS = PREVIEW_LATEST_MS - (PREVIEW_RUN_COUNT - 1) * PREVIEW_INTERVAL_MS;
const PREVIEW_CHANGE_INDEXES = new Set([PREVIEW_RUN_COUNT - 16, PREVIEW_RUN_COUNT - 1]);

function buildPreviewRuns(count: number): TimelineStripPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `preview-run-${index}`,
    executedAt: new Date(PREVIEW_START_MS + index * PREVIEW_INTERVAL_MS).toISOString(),
    status: RunStatus.Success,
    hasChanges:
      index === 0
        ? ChangeStatus.Initial
        : PREVIEW_CHANGE_INDEXES.has(index)
          ? ChangeStatus.Changed
          : ChangeStatus.Unchanged,
    durationMs: 1800 + ((index * 137) % 900),
    contractRevision: null,
    errorMessage: null,
    values: {},
  }));
}

function PreviewAlertCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
          <Bell className="h-3.5 w-3.5" />
          Change detected
        </span>
        <span className="text-xs font-mono text-muted-foreground">{PREVIEW_CHANGE.detectedAt}</span>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{PREVIEW_TARGET.name}</p>
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="h-3 w-3" />
          {PREVIEW_TARGET.host}
        </p>
      </div>

      <div className="rounded-md border border-border bg-background p-3 space-y-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          {PREVIEW_TARGET.field}
        </span>
        <div className="flex flex-wrap items-center gap-2.5 font-mono">
          <span className="text-sm text-muted-foreground line-through">
            {PREVIEW_CHANGE.previous}
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-lg font-semibold text-foreground">{PREVIEW_CHANGE.current}</span>
          <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
            {PREVIEW_CHANGE.delta}
          </span>
        </div>
      </div>
    </div>
  );
}

function PreviewHistoryList() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          Change history
        </span>
        <span className="text-xs font-mono text-muted-foreground">every 1h</span>
      </div>
      <ul className="divide-y divide-border">
        {PREVIEW_HISTORY.map((entry) => (
          <li
            key={entry.time}
            className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs font-mono"
          >
            <span className="text-muted-foreground">{entry.time}</span>
            <div className="flex items-center gap-3">
              <span
                className={
                  entry.status === 'change' ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }
              >
                {entry.value}
              </span>
              <span
                className={`w-20 text-center text-[10px] uppercase px-1 rounded font-semibold ${
                  entry.status === 'change'
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {HISTORY_LABEL[entry.status]}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProductPreview() {
  const runs = React.useMemo(() => buildPreviewRuns(PREVIEW_RUN_COUNT), []);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <PreviewAlertCard />
        <PreviewHistoryList />
      </div>
      <ExecutionTimelineStrip
        runs={runs}
        timeZone="UTC"
        title="Execution timeline (Recent 32 runs)"
        interactive={false}
      />
      <div className="flex justify-end">
        <Badge variant="secondary">Illustrative data</Badge>
      </div>
    </div>
  );
}
