'use client';

import * as React from 'react';
import { AlertCircle, Code2, GitCompare, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';
import { api, type DiffSummary, type JobRunDto, type ScrapingJobDto } from '@/lib/api';
import { formatDateTime, parseErrorMessage } from '@/lib/utils';

export function JobRunsDrawer({
  job,
  onClose,
}: {
  job: ScrapingJobDto | null;
  onClose: () => void;
}) {
  const [runs, setRuns] = React.useState<JobRunDto[]>([]);
  const [latestDiff, setLatestDiff] = React.useState<DiffSummary | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!job) return;
    setLoading(true);
    api
      .getJobRuns(job.id)
      .then((res) => {
        setRuns(res.runs);
        setLatestDiff(res.latestDiff);
      })
      .catch(() => {
        setRuns([]);
        setLatestDiff(null);
      })
      .finally(() => setLoading(false));
  }, [job]);

  if (!job) return null;

  return (
    <Drawer
      isOpen={Boolean(job)}
      onClose={onClose}
      title={job.url}
      description={job.userPrompt}
    >
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
                        <td className="px-3.5 py-2.5 font-mono font-medium text-foreground">{item.field}</td>
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
                  <div
                    key={run.id}
                    className="rounded-lg border border-border bg-card p-4 sm:p-5"
                  >
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
                          <span className="font-mono text-xs text-muted-foreground">HTTP {run.httpStatus}</span>
                        )}
                        {run.durationMs !== null && (
                          <span className="font-mono text-xs text-muted-foreground">{run.durationMs}ms</span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatDateTime(run.executedAt)}
                      </span>
                    </div>

                    {run.normalizedHash && (
                      <p className="mt-2 font-mono text-xs text-muted-foreground truncate">
                        SHA-256: {run.normalizedHash}
                      </p>
                    )}

                    {parsedError && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs sm:text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                        <div className="flex items-start gap-2.5">
                          {parsedError.category === 'anti-bot' ? (
                            <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">
                              {parsedError.title}
                            </p>
                            <p className="mt-0.5 leading-relaxed opacity-90">
                              {parsedError.description}
                            </p>
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
      </div>
    </Drawer>
  );
}
