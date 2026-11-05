'use client';

import { ExecutionTimelineChart } from '@/components/dashboard/ExecutionTimelineChart';
import { ExecutionTimelineStrip } from '@/components/dashboard/ExecutionTimelineStrip';
import { VisualDiffSlider } from '@/components/dashboard/VisualDiffSlider';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';
import { useJobRunsQuery } from '@/hooks/useDashboardQueries';
import type { JobRunDto, ScrapingJobDto } from '@/lib/api';
import { CHANGE_STATUS, JOB_STATUS, RUN_STATUS } from '@/lib/domainValues';
import { EXTRACTION_SCOPE } from '@/lib/extractionPlan';
import { DEFAULT_TIMEZONE, formatDateTime, parseErrorMessage } from '@/lib/utils';
import { getExtractionFieldLabels, localizeExtractedPayload } from '@/lib/extractionDisplay';
import {
  AlertCircle,
  Camera,
  Clock,
  ListChecks,
  ExternalLink,
  GitCompare,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  ZoomIn,
} from 'lucide-react';
import * as React from 'react';

const MONITOR_STATUS = {
  [JOB_STATUS.PendingCompilation]: { label: 'Setting up', variant: 'secondary' },
  [JOB_STATUS.Active]: { label: 'Ready to monitor', variant: 'success' },
  [JOB_STATUS.Healing]: { label: 'Checking monitor', variant: 'warning' },
  [JOB_STATUS.Paused]: { label: 'Paused', variant: 'secondary' },
  [JOB_STATUS.Failed]: { label: 'Needs attention', variant: 'destructive' },
} as const;

function displayValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return 'Not available';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
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
  const { data, isLoading: loading } = useJobRunsQuery(job?.id);
  const runs = data?.runs || [];
  const latestDiff = data?.latestDiff || null;
  const extractionFields = job?.extractionPlan?.intent.fields ?? {};
  const fieldLabels = getExtractionFieldLabels(extractionFields);
  const latestReading = runs.find(
    (run) => run.status === RUN_STATUS.Success && run.extractedData !== null
  );
  const latestData = latestReading?.extractedData;
  const latestRecord = latestData && !('items' in latestData) ? latestData : null;
  const monitorStatus = MONITOR_STATUS[job?.status ?? JOB_STATUS.PendingCompilation];
  const missingField = /Required field '([^']+)' is missing or invalid\./.exec(
    job?.lastError ?? ''
  )?.[1];
  const issueMessage = missingField
    ? `We couldn't find ${fieldLabels[missingField] ?? 'a requested field'} on this page.`
    : parseErrorMessage(job?.lastError)?.description;

  const [activeTab, setActiveTab] = React.useState<'runs' | 'timeline' | 'schema'>('runs');
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = React.useState<string | null>(null);

  const handleSelectRun = (run: JobRunDto) => {
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
    <Drawer isOpen={Boolean(job)} onClose={onClose} title={job.url} description={job.userPrompt}>
      <div className="space-y-6">
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
            Runs ({runs.length})
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
            {runs.length > 0 && (
              <ExecutionTimelineStrip
                runs={runs}
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

                {runs[0]?.screenshotUrl &&
                  (() => {
                    const currentScreenshot = runs[0].screenshotUrl;
                    const priorScreenshotRun = runs.slice(1).find((r) => Boolean(r.screenshotUrl));
                    const previousScreenshot = priorScreenshotRun?.screenshotUrl;

                    return (
                      <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground font-medium">
                          <span className="flex items-center gap-1.5 font-mono">
                            {previousScreenshot ? (
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
                            onClick={() => setSelectedScreenshot(currentScreenshot)}
                            className="flex items-center gap-1 text-xs text-primary hover:underline font-mono cursor-pointer"
                          >
                            <ZoomIn className="h-3 w-3" />
                            Zoom Full Size
                          </button>
                        </div>
                        <div className="p-3">
                          {previousScreenshot ? (
                            <VisualDiffSlider
                              previousUrl={previousScreenshot}
                              currentUrl={currentScreenshot}
                              previousLabel="Previous"
                              currentLabel="Current"
                              onOpenZoom={(url) => setSelectedScreenshot(url)}
                            />
                          ) : (
                            <div
                              className="relative cursor-pointer overflow-hidden rounded-lg max-h-60"
                              onClick={() => setSelectedScreenshot(currentScreenshot)}
                            >
                              <img
                                src={currentScreenshot}
                                alt="Latest visual diff snapshot"
                                className="w-full object-cover object-top"
                                loading="lazy"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
              </section>
            )}

            {/* Execution History */}
            <section className="space-y-3.5">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                Run History ({runs.length})
              </h3>

              {loading ? (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Loading snapshot history...
                </p>
              ) : runs.length === 0 ? (
                <p className="rounded-lg border border-border bg-muted/20 p-4 text-xs sm:text-sm text-muted-foreground">
                  No runs recorded for this monitor yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {runs.map((run) => {
                    const parsedError = run.errorMessage
                      ? parseErrorMessage(run.errorMessage)
                      : null;
                    const isSelected = selectedRunId === run.id;

                    return (
                      <div
                        key={run.id}
                        id={`run-card-${run.id}`}
                        className={`rounded-lg border bg-card p-4 sm:p-5 transition-all ${
                          isSelected
                            ? 'border-primary ring-1 ring-primary/40 bg-muted/10'
                            : 'border-border'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                run.status === RUN_STATUS.Success ? 'success' : 'destructive'
                              }
                            >
                              {run.extractionReport?.quality ?? run.status}
                            </Badge>
                            <Badge
                              variant={
                                run.hasChanges === CHANGE_STATUS.Changed
                                  ? 'warning'
                                  : run.hasChanges === CHANGE_STATUS.Initial
                                    ? 'default'
                                    : 'secondary'
                              }
                            >
                              Change: {run.hasChanges}
                            </Badge>
                            {run.httpStatus && (
                              <span className="font-mono text-xs text-muted-foreground">
                                HTTP {run.httpStatus}
                              </span>
                            )}
                            {run.durationMs !== null && (
                              <span className="font-mono text-xs text-muted-foreground">
                                {run.durationMs}ms
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatDateTime(run.executedAt, timeZone)}
                          </span>
                        </div>

                        {parsedError && (
                          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs sm:text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                            <div className="flex items-start gap-2.5">
                              {parsedError.category === 'anti-bot' ? (
                                <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                              ) : (
                                <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold">{parsedError.title}</p>
                                <p className="mt-0.5 leading-relaxed opacity-90">
                                  {parsedError.description}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {run.screenshotUrl && (
                          <div className="mt-3 overflow-hidden rounded-md border border-border bg-muted/20">
                            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground font-medium">
                              <span className="flex items-center gap-1.5">
                                <Camera className="h-3.5 w-3.5 text-primary" />
                                Visual Diff Screenshot
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedScreenshot(run.screenshotUrl)}
                                className="flex items-center gap-1 text-xs text-primary hover:underline font-mono cursor-pointer"
                              >
                                <ZoomIn className="h-3 w-3" />
                                Zoom
                              </button>
                            </div>
                            <div
                              className="relative cursor-pointer overflow-hidden max-h-48"
                              onClick={() => setSelectedScreenshot(run.screenshotUrl)}
                            >
                              <img
                                src={run.screenshotUrl}
                                alt="Visual snapshot"
                                className="w-full object-cover object-top"
                                loading="lazy"
                              />
                            </div>
                          </div>
                        )}

                        {run.extractedData && (
                          <pre className="mt-2.5 max-h-56 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs text-foreground">
                            {JSON.stringify(
                              localizeExtractedPayload(run.extractedData, extractionFields),
                              null,
                              2
                            )}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: TIMELINE & TRENDS */}
        {activeTab === 'timeline' && (
          <ExecutionTimelineChart
            key={job.id}
            runs={runs}
            revision={job.contractRevision}
            identityFields={job.extractionPlan?.intent.identityFields ?? []}
            fields={extractionFields}
            timeZone={timeZone}
            onSelectRun={handleSelectRun}
            onOpenScreenshot={(url) => setSelectedScreenshot(url)}
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
                                {displayValue(latestRecord?.[key])}
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
            {(job.status === JOB_STATUS.Failed || job.status === JOB_STATUS.Healing) &&
              issueMessage && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {issueMessage}
                </p>
              )}
          </section>
        )}

        {/* Screenshot Modal / Lightbox */}
        {selectedScreenshot && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setSelectedScreenshot(null)}
          >
            <div
              className="relative max-h-[90vh] max-w-4xl w-full overflow-hidden rounded-xl border border-border bg-card p-2 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border pb-2 px-2 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-foreground font-semibold">
                  <Camera className="h-4 w-4 text-primary" />
                  Visual Proof Snapshot
                </span>
                <div className="flex items-center gap-3">
                  <a
                    href={selectedScreenshot}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open full size
                  </a>
                  <button
                    type="button"
                    onClick={() => setSelectedScreenshot(null)}
                    className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="max-h-[80vh] overflow-auto p-2">
                <img
                  src={selectedScreenshot}
                  alt="Visual Proof Snapshot Full"
                  className="w-full rounded-lg object-contain shadow-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
