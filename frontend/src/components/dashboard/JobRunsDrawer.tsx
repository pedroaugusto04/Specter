'use client';

import { ExecutionTimelineChart } from '@/components/dashboard/ExecutionTimelineChart';
import { ExecutionTimelineStrip } from '@/components/dashboard/ExecutionTimelineStrip';
import { VisualDiffSlider } from '@/components/dashboard/VisualDiffSlider';
import { ScreenshotLightbox } from '@/components/dashboard/ScreenshotLightbox';
import { JobRunCard } from '@/components/dashboard/JobRunCard';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { useJobRunsQuery, useJobTimeseriesQuery } from '@/hooks/useDashboardQueries';
import type { JobRunDto, ScrapingJobDto, TimeseriesRange } from '@/lib/api';
import { USER_FAILURES, type IntentField } from '@specter/contracts';
import { CHANGE_STATUS, JOB_STATUS, RUN_STATUS } from '@/lib/domainValues';
import { EXTRACTION_SCOPE } from '@/lib/extractionPlan';
import { DEFAULT_TIMEZONE, formatDateTime, parseErrorMessage } from '@/lib/utils';
import { getExtractionFieldLabels } from '@/lib/extractionDisplay';
import { formatObservedNumber } from '@/lib/numberFormatting';
import {
  AlertCircle,
  Camera,
  Clock,
  ListChecks,
  ExternalLink,
  GitCompare,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  ZoomIn,
} from 'lucide-react';
import * as React from 'react';

const MONITOR_STATUS = {
  [JOB_STATUS.PendingCompilation]: {
    label: 'Compiling selectors — this may take a few minutes',
    variant: 'secondary',
  },
  [JOB_STATUS.Active]: { label: 'Ready to monitor', variant: 'success' },
  [JOB_STATUS.Recovering]: { label: 'Recovering monitor', variant: 'warning' },
  [JOB_STATUS.Paused]: { label: 'Paused', variant: 'secondary' },
  [JOB_STATUS.Failed]: { label: 'Needs attention', variant: 'destructive' },
} as const;

function displayValue(
  value: string | number | boolean | null | undefined,
  field?: Pick<IntentField, 'type' | 'displayName' | 'locale'>
): string {
  if (value === null || value === undefined) return 'Not available';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field?.type === 'number') {
    return String(formatObservedNumber(value, field.locale, field.displayName));
  }
  return String(value);
}

export function JobRunsDrawer({
  job,
  onClose,
  timeZone = DEFAULT_TIMEZONE,
}: {
  job: ScrapingJobDto | null;
  onClose: () => void;
  timeZone?: string;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [chartRange, setChartRange] = React.useState<TimeseriesRange>('all');

  React.useEffect(() => {
    setPage(1);
  }, [job?.id]);

  const { data, isLoading: loading } = useJobRunsQuery(job?.id, page, pageSize);
  const { data: timeseriesData, isLoading: timeseriesLoading } = useJobTimeseriesQuery(
    job?.id,
    chartRange
  );

  const runs: JobRunDto[] = data?.runs ?? [];
  const timeseriesPoints = timeseriesData?.points ?? [];
  const latestDiff = data?.latestDiff ?? null;
  const pagination = data?.pagination;
  const summary = data?.summary ?? {
    totalRuns: 0,
    changedRuns: 0,
    lastChange: null,
    averageDurationMs: null,
  };
  const extractionFields = job?.extractionPlan?.intent.fields ?? {};
  const fieldLabels = getExtractionFieldLabels(extractionFields);
  const latestReading = data?.latestSuccessfulRun;
  const latestData = latestReading?.extractedData;
  const latestRecord = latestData && !('items' in latestData) ? latestData : null;
  const monitorStatus = MONITOR_STATUS[job?.status ?? JOB_STATUS.PendingCompilation];
  const jobFailure = parseErrorMessage(job?.lastError);

  const runsWithScreenshot = React.useMemo(
    () => runs.filter((r): r is JobRunDto & { screenshotUrl: string } => Boolean(r.screenshotUrl)),
    [runs]
  );
  const latestScreenshotRun = runsWithScreenshot[0] ?? null;
  const priorScreenshotRun = runsWithScreenshot[1] ?? null;

  const [activeTab, setActiveTab] = React.useState<'runs' | 'timeline' | 'schema'>('runs');
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = React.useState<string | null>(null);

  const handleSelectRun = (run: { id: string }) => {
    setSelectedRunId(run.id);
    setActiveTab('runs');

    setTimeout(() => {
      const el = document.getElementById(`run-card-${run.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  if (!job) return null;

  return (
    <Drawer isOpen={Boolean(job)} onClose={onClose} title={job.name}>
      <div className="space-y-6">
        {job.status === JOB_STATUS.Failed && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <FailureDetails failure={jobFailure ?? USER_FAILURES.requestFailed} />
          </div>
        )}
        {job.status === JOB_STATUS.Active && jobFailure && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-mono font-medium text-amber-500 uppercase tracking-wider">
                  Recompilation Notice
                </p>
                <FailureDetails failure={jobFailure} />
                <p className="text-xs text-muted-foreground pt-1">
                  The monitor remains active and continues collecting data using its current extraction plan.
                </p>
              </div>
            </div>
          </div>
        )}
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('runs')}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-mono font-medium transition-colors cursor-pointer ${
              activeTab === 'runs'
                ? 'bg-card text-foreground shadow-2xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Runs ({summary.totalRuns})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-mono font-medium transition-colors cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-card text-foreground shadow-2xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Timeline & Trends
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-mono font-medium transition-colors cursor-pointer ${
              activeTab === 'schema'
                ? 'bg-card text-foreground shadow-2xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            Monitored data
          </button>
        </div>

        {/* TAB 1: RUNS LIST */}
        {activeTab === 'runs' && (
          <div className="space-y-6">
            {/* Timeline Strip (Status bar over time) */}
            {(timeseriesPoints.length > 0 || runs.length > 0) && (
              <ExecutionTimelineStrip
                runs={timeseriesPoints.length > 0 ? timeseriesPoints : runs}
                timeZone={timeZone}
                selectedRunId={selectedRunId}
                onSelectRun={handleSelectRun}
              />
            )}

            {/* Latest Diff Summary */}
            {latestDiff && latestDiff.hasChanges && (
              <section className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                  <GitCompare className="h-4 w-4" />
                  Latest Diff ({latestDiff.totalChanges} changes)
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-muted/40 font-mono text-xs uppercase text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-3.5 py-2.5">Field</th>
                        <th className="px-3.5 py-2.5">Type</th>
                        <th className="px-3.5 py-2.5">Previous</th>
                        <th className="px-3.5 py-2.5">Current</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[...latestDiff.modified, ...latestDiff.added, ...latestDiff.removed].map(
                        (item) => (
                          <tr key={item.field}>
                            <td className="px-3.5 py-2.5 font-mono font-medium text-foreground">
                              {fieldLabels[item.field] ?? item.field}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <Badge
                                variant={
                                  item.changeType === 'MODIFIED'
                                    ? 'warning'
                                    : item.changeType === 'ADDED'
                                      ? 'success'
                                      : 'destructive'
                                }
                              >
                                {item.changeType}
                              </Badge>
                            </td>
                            <td className="px-3.5 py-2.5 text-muted-foreground font-mono">
                              {item.previousValue === null ? '—' : String(item.previousValue)}
                            </td>
                            <td className="px-3.5 py-2.5 font-mono font-semibold text-foreground">
                              {item.currentValue === null ? '—' : String(item.currentValue)}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                {latestScreenshotRun && (
                  <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                    <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground font-medium">
                      <span className="flex items-center gap-1.5 font-mono">
                        {priorScreenshotRun ? (
                          <>
                            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                            Visual Diff (Before vs After)
                          </>
                        ) : (
                          <>
                            <Camera className="h-3.5 w-3.5 text-primary" />
                            Visual Snapshot Proof
                          </>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedScreenshot(latestScreenshotRun.screenshotUrl)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline font-mono cursor-pointer"
                      >
                        <ZoomIn className="h-3 w-3" />
                        Zoom Full Size
                      </button>
                    </div>
                    <div className="p-3">
                      {priorScreenshotRun ? (
                        <VisualDiffSlider
                          previousUrl={priorScreenshotRun.screenshotUrl}
                          currentUrl={latestScreenshotRun.screenshotUrl}
                          previousLabel="Previous"
                          currentLabel="Current"
                          previousDate={formatDateTime(priorScreenshotRun.executedAt, timeZone)}
                          currentDate={formatDateTime(latestScreenshotRun.executedAt, timeZone)}
                          onOpenZoom={(url) => setSelectedScreenshot(url)}
                        />
                      ) : (
                        <div
                          className="relative cursor-pointer overflow-hidden rounded-lg max-h-60"
                          onClick={() => setSelectedScreenshot(latestScreenshotRun.screenshotUrl)}
                        >
                          <img
                            src={latestScreenshotRun.screenshotUrl}
                            alt="Latest visual diff snapshot"
                            className="w-full object-cover object-top"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Execution History */}
            <section className="space-y-3.5">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                Run History ({summary.totalRuns})
              </h3>

              {loading ? (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Loading snapshot history...
                </p>
              ) : runs.length === 0 ? (
                job.status === JOB_STATUS.PendingCompilation ? (
                  <div className="rounded-xl border border-border bg-muted/30 p-6 text-center space-y-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary animate-pulse">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-foreground">
                        {MONITOR_STATUS[JOB_STATUS.PendingCompilation].label}
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                        Analyzing the live page, detecting monitored fields, and running live
                        verification. Results and snapshots will appear here automatically.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-border bg-muted/20 p-4 text-xs sm:text-sm text-muted-foreground">
                    No runs recorded for this monitor yet.
                  </p>
                )
              ) : (
                <div className="space-y-3">
                  {runs.map((run, index) => {
                    const priorRun = runs.slice(index + 1).find((r) => Boolean(r.screenshotUrl));
                    return (
                      <JobRunCard
                        key={run.id}
                        run={run}
                        isSelected={selectedRunId === run.id}
                        timeZone={timeZone}
                        extractionFields={extractionFields}
                        previousScreenshot={priorRun?.screenshotUrl}
                        previousRunDate={
                          priorRun ? formatDateTime(priorRun.executedAt, timeZone) : undefined
                        }
                        onOpenScreenshot={(url) => setSelectedScreenshot(url)}
                      />
                    );
                  })}
                </div>
              )}

              {pagination && pagination.totalPages > 1 && (
                <PaginationControls
                  page={page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.totalItems}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(1);
                  }}
                  itemLabel="runs"
                />
              )}
            </section>
          </div>
        )}

        {/* TAB 2: TIMELINE & TRENDS */}
        {activeTab === 'timeline' && (
          <ExecutionTimelineChart
            key={job.id}
            runs={runs}
            points={timeseriesPoints}
            revision={job.contractRevision}
            identityFields={job.extractionPlan?.intent.identityFields ?? []}
            fields={extractionFields}
            timeZone={timeZone}
            summary={summary}
            timeRange={chartRange}
            onTimeRangeChange={setChartRange}
            isLoading={timeseriesLoading}
          />
        )}

        {/* TAB 3: MONITORED DATA */}
        {activeTab === 'schema' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                <ListChecks className="h-4 w-4" />
                What this monitor tracks
              </div>
              <Badge variant={monitorStatus.variant}>{monitorStatus.label}</Badge>
            </div>

            {job.extractionPlan ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground">Information tracked</h3>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {Object.values(fieldLabels).map((label, index) => (
                      <li
                        key={`${label}-${index}`}
                        className="rounded-md bg-muted px-2.5 py-1 text-sm text-foreground"
                      >
                        {label}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {job.extractionPlan.intent.scope === EXTRACTION_SCOPE.Collection
                      ? 'Covers all pages in the list.'
                      : 'Covers this page.'}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground">Last successful reading</h3>
                  {loading ? (
                    <p className="mt-2 text-sm text-muted-foreground">Loading recent readings...</p>
                  ) : latestReading && latestData ? (
                    <>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(latestReading.executedAt, timeZone)}
                      </p>
                      {'items' in latestData ? (
                        <p className="mt-3 text-sm text-foreground">
                          {latestData.count} {latestData.count === 1 ? 'item' : 'items'} found.
                        </p>
                      ) : (
                        <dl className="mt-3 space-y-2">
                          {Object.keys(extractionFields).map((key) => (
                            <div
                              key={key}
                              className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm"
                            >
                              <dt className="text-muted-foreground">{fieldLabels[key] ?? key}</dt>
                              <dd className="max-w-full break-words text-right text-foreground">
                                {displayValue(latestRecord?.[key], extractionFields[key])}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectRun(latestReading)}
                        className="mt-4 text-xs font-medium text-primary hover:underline"
                      >
                        View run history
                      </button>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No readings yet. Results will appear after the first successful check.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-border bg-muted/20 p-4 text-xs sm:text-sm text-muted-foreground">
                We are setting up this monitor. The information it tracks will appear here when
                setup is complete.
              </p>
            )}
            {(job.status === JOB_STATUS.Failed || job.status === JOB_STATUS.Recovering) &&
              jobFailure && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  <FailureDetails failure={jobFailure} />
                </div>
              )}
          </section>
        )}

        {/* Screenshot Modal / Lightbox */}
        <ScreenshotLightbox
          screenshotUrl={selectedScreenshot}
          onClose={() => setSelectedScreenshot(null)}
        />
      </div>
    </Drawer>
  );
}

function FailureDetails({
  failure,
}: {
  failure: NonNullable<ReturnType<typeof parseErrorMessage>>;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="font-semibold">{failure.title}</p>
      <details className="mt-2">
        <summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
          View failure details
        </summary>
        <p className="mt-2 leading-relaxed">{failure.description}</p>
        <p className="mt-2 font-medium">What you can do</p>
        <p className="mt-1 leading-relaxed">{failure.nextStep}</p>
      </details>
    </div>
  );
}
