'use client';

import * as React from 'react';
import {
  Clock,
  ExternalLink,
  History,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useModal } from '@/components/ui/modal-dialog';
import { api, type JobStatus, type ScrapingJobDto } from '@/lib/api';
import { formatDateTime, parseErrorMessage } from '@/lib/utils';

function renderStatusBadge(status: JobStatus) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">ACTIVE</Badge>;
    case 'PENDING_COMPILATION':
      return <Badge variant="warning">AI COMPILING</Badge>;
    case 'HEALING':
      return <Badge variant="warning">SELF-HEALING</Badge>;
    case 'FAILED':
      return <Badge variant="destructive">FAILED</Badge>;
    case 'PAUSED':
    default:
      return <Badge variant="secondary">PAUSED</Badge>;
  }
}

export function JobsTable({
  jobs,
  onRefresh,
  onSelectJobForHistory,
  onEditJob,
}: {
  jobs: ScrapingJobDto[];
  onRefresh: () => void;
  onSelectJobForHistory: (job: ScrapingJobDto) => void;
  onEditJob: (job: ScrapingJobDto) => void;
}) {
  const [busyJobId, setBusyJobId] = React.useState<string | null>(null);
  const modal = useModal();

  const handleAction = async (jobId: string, fn: () => Promise<unknown>) => {
    setBusyJobId(jobId);
    try {
      await fn();
      onRefresh();
    } catch (err) {
      await modal.alert({
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Error executing action.',
      });
    } finally {
      setBusyJobId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Configured Monitors ({jobs.length})</CardTitle>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
            <p className="text-sm font-medium text-slate-600">
              No monitoring jobs configured yet.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Use the form above to compile your first autonomous extractor.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 pr-4">Target & Prompt</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Cron</th>
                  <th className="px-3 py-3">Failures</th>
                  <th className="px-3 py-3">Updated</th>
                  <th className="py-3 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const isBusy = busyJobId === job.id;
                  const isPaused = job.status === 'PAUSED';
                  const parsedError = job.lastError ? parseErrorMessage(job.lastError) : null;

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/70">
                      <td className="max-w-md py-3.5 pr-4">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900">
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate hover:underline"
                          >
                            {job.url}
                          </a>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                          {job.userPrompt}
                        </p>
                        {parsedError && (
                          <div
                            className="mt-1 flex items-center gap-1.5 rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700"
                            title={parsedError.description}
                          >
                            <ShieldAlert className="h-3 w-3 shrink-0 text-red-500" />
                            <span className="truncate">
                              {parsedError.title}: {parsedError.description}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3.5">
                        {renderStatusBadge(job.status)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3.5 font-mono text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {job.cronExpression}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3.5 text-xs">
                        <span
                          className={
                            job.failureCount > 0
                              ? 'font-semibold text-amber-600'
                              : 'text-slate-500'
                          }
                        >
                          {job.failureCount}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3.5 text-xs text-slate-500">
                        {formatDateTime(job.updatedAt)}
                      </td>

                      <td className="whitespace-nowrap py-3.5 pl-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            title="Edit monitor configuration"
                            onClick={() => onEditJob(job)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            title="Run immediate extraction"
                            onClick={() => handleAction(job.id, () => api.triggerNow(job.id))}
                          >
                            <Zap className="h-3.5 w-3.5" />
                            Run
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            title="View snapshots, compiled selectors and diff history"
                            onClick={() => onSelectJobForHistory(job)}
                          >
                            <History className="h-3.5 w-3.5" />
                            History & Diff
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            title="Force AI re-compilation of selectors"
                            onClick={() =>
                              handleAction(job.id, () => api.triggerRecompile(job.id))
                            }
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            title={isPaused ? 'Resume schedule' : 'Pause schedule'}
                            onClick={() =>
                              handleAction(job.id, () => api.togglePause(job.id, !isPaused))
                            }
                          >
                            {isPaused ? (
                              <Play className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Pause className="h-3.5 w-3.5 text-slate-600" />
                            )}
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            title="Delete monitor"
                            onClick={async () => {
                              const confirmed = await modal.confirm({
                                title: 'Delete Monitor',
                                message: `Are you sure you want to permanently delete this monitor?\n${job.url}`,
                                confirmLabel: 'Delete',
                                cancelLabel: 'Cancel',
                                variant: 'destructive',
                              });
                              if (confirmed) {
                                void handleAction(job.id, () => api.deleteJob(job.id));
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
