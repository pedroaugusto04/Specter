'use client';

import * as React from 'react';
import {
  Clock,
  ExternalLink,
  History,
  Loader2,
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

type RowActionType = 'run' | 'recompile' | 'pause' | 'delete';

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
  isRefreshing = false,
  onSelectJobForHistory,
  onEditJob,
}: {
  jobs: ScrapingJobDto[];
  onRefresh: () => void;
  isRefreshing?: boolean;
  onSelectJobForHistory: (job: ScrapingJobDto) => void;
  onEditJob: (job: ScrapingJobDto) => void;
}) {
  const [activeActions, setActiveActions] = React.useState<Record<string, RowActionType>>({});
  const modal = useModal();

  const handleAction = async (
    jobId: string,
    action: RowActionType,
    fn: () => Promise<unknown>
  ) => {
    setActiveActions((prev) => ({ ...prev, [jobId]: action }));
    try {
      await fn();
      onRefresh();
    } catch (err) {
      await modal.alert({
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Error executing action.',
      });
    } finally {
      setActiveActions((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Configured Monitors ({jobs.length})</CardTitle>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
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
                  <th className="w-48 max-w-[200px] py-3 pr-4">Target</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Cron</th>
                  <th className="px-3 py-3">Failures</th>
                  <th className="px-3 py-3">Updated</th>
                  <th className="py-3 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const currentAction = activeActions[job.id];
                  const isJobBusy = Boolean(currentAction);
                  const isRunning = currentAction === 'run';
                  const isRecompilingAction = currentAction === 'recompile';
                  const isPausing = currentAction === 'pause';
                  const isDeleting = currentAction === 'delete';

                  const isCompilingState =
                    job.status === 'PENDING_COMPILATION' || job.status === 'HEALING';
                  const isCompiling = isCompilingState || isRecompilingAction;
                  const isPaused = job.status === 'PAUSED';
                  const parsedError = job.lastError ? parseErrorMessage(job.lastError) : null;

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/70">
                      <td className="w-48 max-w-[200px] py-3.5 pr-4">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900 min-w-0">
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noreferrer"
                            title={job.url}
                            className="truncate hover:underline"
                          >
                            {job.url}
                          </a>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </div>
                        <p
                          className="mt-0.5 truncate text-xs text-slate-500"
                          title={job.userPrompt}
                        >
                          {job.userPrompt}
                        </p>
                        {parsedError && (
                          <div
                            className="mt-1 flex items-center gap-1.5 rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700 min-w-0"
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
                          {/* Edit: disabled while compiling, running or deleting */}
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isJobBusy || isCompiling}
                            title={
                              isCompiling
                                ? 'Cannot edit monitor while AI selector compilation is in progress'
                                : isRunning
                                  ? 'Cannot edit monitor while extraction is in progress'
                                  : 'Edit monitor configuration'
                            }
                            aria-label="Edit monitor configuration"
                            onClick={() => onEditJob(job)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>

                          {/* Run: disabled while compiling or if any action is busy; shows loading when running */}
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isJobBusy || isCompiling}
                            title={
                              isCompiling
                                ? 'Cannot run extraction while AI selector compilation is in progress'
                                : isRunning
                                  ? 'Executing extraction...'
                                  : isJobBusy
                                    ? 'Action in progress...'
                                    : 'Run immediate extraction'
                            }
                            aria-label="Run immediate extraction"
                            onClick={() =>
                              handleAction(job.id, 'run', () => api.triggerNow(job.id))
                            }
                          >
                            {isRunning ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                            ) : (
                              <Zap className="h-3.5 w-3.5" />
                            )}
                          </Button>

                          {/* History & Diff: read-only, remains enabled unless the row is being deleted */}
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isDeleting}
                            title="View snapshots, compiled selectors and diff history"
                            aria-label="View snapshots, compiled selectors and diff history"
                            onClick={() => onSelectJobForHistory(job)}
                          >
                            <History className="h-3.5 w-3.5" />
                          </Button>

                          {/* Recompile: disabled while compiling or running; shows loading spinner while compiling */}
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isJobBusy || isCompiling}
                            title={
                              isCompiling
                                ? 'AI compilation is already in progress'
                                : isRunning
                                  ? 'Cannot recompile while extraction is running'
                                  : 'Force AI re-compilation of selectors'
                            }
                            aria-label="Force AI re-compilation of selectors"
                            onClick={() =>
                              handleAction(job.id, 'recompile', () =>
                                api.triggerRecompile(job.id)
                              )
                            }
                          >
                            {isCompiling ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                          </Button>

                          {/* Pause/Resume schedule: disabled during busy action or while compiling */}
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isJobBusy || isCompiling}
                            title={
                              isCompiling
                                ? 'Schedule is suspended during AI compilation'
                                : isRunning
                                  ? 'Cannot change schedule state while extraction is running'
                                  : isPaused
                                    ? 'Resume schedule'
                                    : 'Pause schedule'
                            }
                            aria-label={isPaused ? 'Resume schedule' : 'Pause schedule'}
                            onClick={() =>
                              handleAction(job.id, 'pause', () =>
                                api.togglePause(job.id, !isPaused)
                              )
                            }
                          >
                            {isPausing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                            ) : isPaused ? (
                              <Play className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Pause className="h-3.5 w-3.5 text-slate-600" />
                            )}
                          </Button>

                          {/* Delete: disabled while any action is in flight */}
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isJobBusy}
                            title={
                              isRunning
                                ? 'Cannot delete while extraction is in progress'
                                : isRecompilingAction
                                  ? 'Cannot delete while recompile request is running'
                                  : 'Delete monitor'
                            }
                            aria-label="Delete monitor"
                            onClick={async () => {
                              const confirmed = await modal.confirm({
                                title: 'Delete Monitor',
                                message: `Are you sure you want to permanently delete this monitor?\n${job.url}`,
                                confirmLabel: 'Delete',
                                cancelLabel: 'Cancel',
                                variant: 'destructive',
                              });
                              if (confirmed) {
                                void handleAction(job.id, 'delete', () => api.deleteJob(job.id));
                              }
                            }}
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            )}
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
