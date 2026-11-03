'use client';

import * as React from 'react';
import {
  AlertCircle,
  Camera,
  Code2,
  ExternalLink,
  GitCompare,
  ShieldAlert,
  SlidersHorizontal,
  ZoomIn,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';
import { VisualDiffSlider } from '@/components/dashboard/VisualDiffSlider';
import { useJobRunsQuery } from '@/hooks/useDashboardQueries';
import type { ScrapingJobDto } from '@/lib/api';
import { DEFAULT_TIMEZONE, formatDateTime, parseErrorMessage } from '@/lib/utils';

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
  const [selectedScreenshot, setSelectedScreenshot] = React.useState<string | null>(null);
  const [zoomFitMode, setZoomFitMode] = React.useState<'contain' | 'actual'>('contain');

  if (!job) return null;

  return (
    <Drawer isOpen={Boolean(job)} onClose={onClose} title={job.url} description={job.userPrompt}>
      <div className="space-y-6">
        {/* Compiled Extractor Schema */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
            <Code2 className="h-4 w-4" />
            Extraction Schema
          </div>
          {job.extractorConfig ? (
            <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/50 p-3.5 font-mono text-xs text-foreground">
              {JSON.stringify(job.extractorConfig, null, 2)}
            </pre>
          ) : (
            <p className="rounded-lg border border-border bg-muted/20 p-3.5 text-xs sm:text-sm text-muted-foreground">
              Extraction schema has not been generated yet.
            </p>
          )}
        </section>

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
                          {item.field}
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
                // Find the closest prior run that has a screenshot
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
                          className="relative group cursor-pointer overflow-hidden rounded-lg aspect-video max-h-72 w-full border border-border bg-black/5 dark:bg-black/30"
                          onClick={() => setSelectedScreenshot(currentScreenshot)}
                        >
                          <img
                            src={currentScreenshot}
                            alt="Latest visual diff snapshot"
                            className="w-full h-full object-contain select-none"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 dark:group-hover:bg-white/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <span className="rounded bg-background/90 px-2 py-1 text-[11px] font-mono font-medium text-foreground shadow-sm flex items-center gap-1 border border-border">
                              <ZoomIn className="h-3 w-3" /> Click to enlarge
                            </span>
                          </div>
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
            <p className="text-xs sm:text-sm text-muted-foreground">Loading snapshot history...</p>
          ) : runs.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted/20 p-4 text-xs sm:text-sm text-muted-foreground">
              No runs recorded for this monitor yet.
            </p>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => {
                const parsedError = run.errorMessage ? parseErrorMessage(run.errorMessage) : null;

                return (
                  <div key={run.id} className="rounded-lg border border-border bg-card p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2">
                        <Badge variant={run.status === 'SUCCESS' ? 'success' : 'destructive'}>
                          {run.status}
                        </Badge>
                        <Badge
                          variant={
                            run.hasChanges === 'YES'
                              ? 'warning'
                              : run.hasChanges === 'INITIAL'
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
                          <span className="flex items-center gap-1.5 font-mono">
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
                          className="relative group cursor-pointer overflow-hidden aspect-video max-h-56 w-full bg-black/5 dark:bg-black/30"
                          onClick={() => setSelectedScreenshot(run.screenshotUrl)}
                        >
                          <img
                            src={run.screenshotUrl}
                            alt="Visual snapshot"
                            className="w-full h-full object-contain select-none"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 dark:group-hover:bg-white/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <span className="rounded bg-background/90 px-2 py-1 text-[11px] font-mono font-medium text-foreground shadow-sm flex items-center gap-1 border border-border">
                              <ZoomIn className="h-3 w-3" /> Click to enlarge
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {run.extractedData && (
                      <pre className="mt-2.5 max-h-56 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs text-foreground">
                        {JSON.stringify(run.extractedData, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Screenshot Modal / Lightbox */}
        {selectedScreenshot && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-5 backdrop-blur-sm"
            onClick={() => setSelectedScreenshot(null)}
          >
            <div
              className="relative flex flex-col max-h-[92vh] max-w-5xl w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border py-2.5 px-3 sm:px-4 text-xs font-mono bg-muted/30">
                <span className="flex items-center gap-2 text-foreground font-semibold">
                  <Camera className="h-4 w-4 text-primary" />
                  Visual Proof Snapshot
                </span>
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* View Mode Toggle: Fit to Window vs Original 1:1 */}
                  <div className="flex items-center rounded-md border border-border bg-background p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setZoomFitMode('contain')}
                      className={`px-2 py-0.5 rounded font-mono transition-colors cursor-pointer ${
                        zoomFitMode === 'contain'
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Fit Window
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomFitMode('actual')}
                      className={`px-2 py-0.5 rounded font-mono transition-colors cursor-pointer ${
                        zoomFitMode === 'actual'
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      100% Size
                    </button>
                  </div>

                  <a
                    href={selectedScreenshot}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors font-mono"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open full size
                  </a>
                  <button
                    type="button"
                    onClick={() => setSelectedScreenshot(null)}
                    className="rounded border border-border px-2.5 py-1 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Viewport content */}
              <div className="flex-1 flex items-center justify-center overflow-auto p-3 sm:p-4 bg-black/10 dark:bg-black/40 min-h-[250px] max-h-[82vh]">
                <img
                  src={selectedScreenshot}
                  alt="Visual Proof Snapshot Full"
                  className={
                    zoomFitMode === 'contain'
                      ? 'max-h-[76vh] max-w-full w-auto h-auto object-contain rounded-lg shadow-md mx-auto select-none'
                      : 'w-auto h-auto max-w-none rounded-lg shadow-md mx-auto select-none'
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
