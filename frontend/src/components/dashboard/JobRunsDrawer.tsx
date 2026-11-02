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
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <Code2 className="h-4 w-4" />
            Extraction Schema
          </div>
          {job.extractorConfig ? (
            <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(job.extractorConfig, null, 2)}
            </pre>
          ) : (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              Extraction schema has not been generated yet.
            </p>
          )}
        </section>

        {/* Latest Diff Summary */}
        {latestDiff && latestDiff.hasChanges && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <GitCompare className="h-4 w-4" />
              Latest Diff ({latestDiff.totalChanges} changes)
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Field</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Previous</th>
                    <th className="px-3 py-2">Current</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...latestDiff.modified, ...latestDiff.added, ...latestDiff.removed].map(
                    (item) => (
                      <tr key={item.field}>
                        <td className="px-3 py-2 font-mono font-medium">{item.field}</td>
                        <td className="px-3 py-2">
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
                        <td className="px-3 py-2 text-slate-500">
                          {item.previousValue === null ? '—' : String(item.previousValue)}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900">
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
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Run History ({runs.length})
          </h3>

          {loading ? (
            <p className="text-xs text-slate-500">Loading snapshot history...</p>
          ) : runs.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
              No runs recorded for this monitor yet.
            </p>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => {
                const parsedError = run.errorMessage ? parseErrorMessage(run.errorMessage) : null;

                return (
                  <div
                    key={run.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
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
                          <span className="text-xs text-slate-500">HTTP {run.httpStatus}</span>
                        )}
                        {run.durationMs !== null && (
                          <span className="text-xs text-slate-400">{run.durationMs}ms</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {formatDateTime(run.executedAt)}
                      </span>
                    </div>

                    {run.normalizedHash && (
                      <p className="mt-1.5 font-mono text-[11px] text-slate-400">
                        SHA-256: {run.normalizedHash}
                      </p>
                    )}

                    {parsedError && (
                      <div className="mt-2.5 rounded-lg border border-red-200 bg-red-50/80 p-3 text-xs text-red-900">
                        <div className="flex items-start gap-2">
                          {parsedError.category === 'anti-bot' ? (
                            <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                          ) : (
                            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-red-950">
                              {parsedError.title}
                            </p>
                            <p className="mt-0.5 text-red-800 leading-relaxed">
                              {parsedError.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {run.extractedData && (
                      <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-50 p-2.5 text-xs text-slate-800">
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
