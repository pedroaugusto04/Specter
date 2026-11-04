'use client';

import { Button } from '@/components/ui/button';
import { useModal } from '@/components/ui/modal-dialog';
import {
  useDeleteJobMutation,
  useRecompileJobMutation,
  useTogglePauseMutation,
  useTriggerJobMutation,
} from '@/hooks/useDashboardQueries';
import type { JobStatus, ScrapingJobDto } from '@/lib/api';
import { JOB_STATUS, JOB_STATUS_FILTER } from '@/lib/domainValues';
import {
  DEFAULT_TIMEZONE,
  formatCompactDate,
  formatDateTime,
} from '@/lib/utils';
import {
  Clock,
  ExternalLink,
  History,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import * as React from 'react';

type RowActionType = 'run' | 'recompile' | 'pause' | 'delete';
type StatusFilter = (typeof JOB_STATUS_FILTER)[keyof typeof JOB_STATUS_FILTER];

function formatDisplayUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${host}${pathname}`;
  } catch {
    return rawUrl.replace(/^https?:\/\/(www\.)?/, '');
  }
}

function renderStatusPill(status: JobStatus) {
  switch (status) {
    case JOB_STATUS.Active:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-900 bg-zinc-900 px-2.5 py-1 font-mono text-xs font-medium tracking-wider text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          ACTIVE
        </span>
      );
    case JOB_STATUS.PendingCompilation:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 font-mono text-xs font-medium tracking-wider text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground animate-ping" />
          COMPILING
        </span>
      );
    case JOB_STATUS.Healing:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 font-mono text-xs font-medium tracking-wider text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground animate-pulse" />
          ADAPTING
        </span>
      );
    case JOB_STATUS.Failed:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 font-mono text-xs font-medium tracking-wider text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          FAILED
        </span>
      );
    case JOB_STATUS.Paused:
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-xs font-medium tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
          PAUSED
        </span>
      );
  }
}

export function JobsTable({
  jobs,
  onRefresh,
  isRefreshing = false,
  onSelectJobForHistory,
  onEditJob,
  onCreateClick,
  timeZone = DEFAULT_TIMEZONE,
}: {
  jobs: ScrapingJobDto[];
  onRefresh: () => void;
  isRefreshing?: boolean;
  onSelectJobForHistory: (job: ScrapingJobDto) => void;
  onEditJob: (job: ScrapingJobDto) => void;
  onCreateClick?: () => void;
  timeZone?: string;
}) {
  const [activeActions, setActiveActions] = React.useState<Record<string, RowActionType>>({});
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filter, setFilter] = React.useState<StatusFilter>('ALL');
  const modal = useModal();
  const triggerJobMutation = useTriggerJobMutation();
  const recompileJobMutation = useRecompileJobMutation();
  const togglePauseMutation = useTogglePauseMutation();
  const deleteJobMutation = useDeleteJobMutation();

  const handleAction = async (jobId: string, action: RowActionType, fn: () => Promise<unknown>) => {
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

  // Counts for filter tabs
  const activeCount = React.useMemo(
    () => jobs.filter((j) => j.status === JOB_STATUS.Active).length,
    [jobs]
  );
  const healingCount = React.useMemo(
    () =>
      jobs.filter(
        (j) => j.status === JOB_STATUS.Healing || j.status === JOB_STATUS.PendingCompilation
      ).length,
    [jobs]
  );
  const pausedOrFailedCount = React.useMemo(
    () =>
      jobs.filter((j) => j.status === JOB_STATUS.Paused || j.status === JOB_STATUS.Failed).length,
    [jobs]
  );

  // Filtered jobs
  const filteredJobs = React.useMemo(() => {
    return jobs.filter((job) => {
      if (filter === JOB_STATUS_FILTER.Active && job.status !== JOB_STATUS.Active) return false;
      if (
        filter === JOB_STATUS_FILTER.Healing &&
        job.status !== JOB_STATUS.Healing &&
        job.status !== JOB_STATUS.PendingCompilation
      ) {
        return false;
      }
      if (
        filter === JOB_STATUS_FILTER.Paused &&
        job.status !== JOB_STATUS.Paused &&
        job.status !== JOB_STATUS.Failed
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesUrl = job.url.toLowerCase().includes(query);
        const matchesPrompt = job.userPrompt.toLowerCase().includes(query);
        return matchesUrl || matchesPrompt;
      }

      return true;
    });
  }, [jobs, filter, searchQuery]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Table Action Bar */}
      <div className="border-b border-border bg-muted/20 p-3 sm:p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Status Filter Tabs */}
        <div className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 p-1 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`rounded px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              filter === JOB_STATUS_FILTER.All
                ? 'bg-card text-foreground shadow-2xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All <span className="ml-1.5 font-mono text-xs opacity-60">{jobs.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter(JOB_STATUS_FILTER.Active)}
            className={`rounded px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              filter === JOB_STATUS_FILTER.Active
                ? 'bg-card text-foreground shadow-2xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Active <span className="ml-1.5 font-mono text-xs opacity-60">{activeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter(JOB_STATUS_FILTER.Healing)}
            className={`rounded px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              filter === JOB_STATUS_FILTER.Healing
                ? 'bg-card text-foreground shadow-2xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Syncing <span className="ml-1.5 font-mono text-xs opacity-60">{healingCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter(JOB_STATUS_FILTER.Paused)}
            className={`rounded px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              filter === JOB_STATUS_FILTER.Paused
                ? 'bg-card text-foreground shadow-2xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Paused / Failed{' '}
            <span className="ml-1.5 font-mono text-xs opacity-60">{pausedOrFailedCount}</span>
          </button>
        </div>

        {/* Search & Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64 md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by URL or instructions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
            />
          </div>

          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-9 shrink-0 text-xs sm:text-sm px-3 sm:px-3.5 gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Table Content */}
      {filteredJobs.length === 0 ? (
        <div className="py-16 px-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground">
            <Search className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            {searchQuery || filter !== JOB_STATUS_FILTER.All
              ? 'No matching monitors'
              : 'No monitors configured'}
          </h3>
          <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
            {searchQuery || filter !== JOB_STATUS_FILTER.All
              ? 'Try clearing the search query or switching the status filter.'
              : 'Create your first monitor to begin scheduled extraction and change detection.'}
          </p>
          {onCreateClick && !searchQuery && filter === JOB_STATUS_FILTER.All && (
            <div className="mt-6">
              <Button onClick={onCreateClick} className="h-9 px-4 text-sm gap-2">
                <Plus className="h-4 w-4" />
                <span>New Monitor</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm table-fixed">
            <thead>
              <tr className="border-b border-border text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="py-3 px-3 sm:px-4">Target</th>
                <th className="w-[125px] px-2.5 py-3">Status</th>
                <th className="w-[110px] px-2.5 py-3">Schedule</th>
                <th className="w-[80px] px-2.5 py-3">Failures</th>
                <th className="w-[130px] px-2.5 py-3">Last Checked</th>
                <th className="w-[210px] py-3 pr-3 pl-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredJobs.map((job) => {
                const currentAction = activeActions[job.id];
                const isJobBusy = Boolean(currentAction);
                const isRunning = currentAction === 'run';
                const isRecompilingAction = currentAction === 'recompile';
                const isPausing = currentAction === 'pause';
                const isDeleting = currentAction === 'delete';

                const isCompilingState =
                  job.status === JOB_STATUS.PendingCompilation || job.status === JOB_STATUS.Healing;
                const isCompiling = isCompilingState || isRecompilingAction;
                const isPaused = job.status === JOB_STATUS.Paused;

                return (
                  <tr key={job.id} className="group hover:bg-muted/30 transition-colors">
                    {/* Target & Prompt */}
                    <td className="py-3 px-3 sm:px-4 min-w-0">
                      <div className="flex items-center gap-1.5 font-medium text-foreground min-w-0">
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          title={job.url}
                          className="truncate hover:underline underline-offset-4 text-xs sm:text-sm font-medium inline-block max-w-[200px] sm:max-w-[280px] md:max-w-md"
                        >
                          {formatDisplayUrl(job.url)}
                        </a>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
                      </div>
                      <p
                        className="mt-0.5 truncate text-xs text-muted-foreground block max-w-[200px] sm:max-w-[280px] md:max-w-md"
                        title={job.userPrompt}
                      >
                        {job.userPrompt}
                      </p>
                    </td>

                    {/* Status Pill */}
                    <td className="whitespace-nowrap px-2.5 py-3">
                      {renderStatusPill(job.status)}
                      {job.accessState && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Access blocked. New attempts allowed after{' '}
                          {formatDateTime(job.accessState.retryAt, timeZone)}.
                        </p>
                      )}
                    </td>

                    {/* Cron */}
                    <td className="whitespace-nowrap px-2.5 py-3 font-mono text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground/70" />
                        <span className="truncate">{job.cronExpression}</span>
                      </span>
                    </td>

                    {/* Failures */}
                    <td className="whitespace-nowrap px-2.5 py-3 text-xs">
                      <span
                        className={
                          job.failureCount > 0
                            ? 'font-mono font-semibold text-foreground underline decoration-red-500/60 underline-offset-4'
                            : 'font-mono text-muted-foreground'
                        }
                      >
                        {job.failureCount}
                      </span>
                    </td>

                    {/* Updated At */}
                    <td
                      className="whitespace-nowrap px-2.5 py-3 text-xs text-muted-foreground font-mono"
                      title={formatDateTime(job.updatedAt, timeZone)}
                    >
                      {formatCompactDate(job.updatedAt, timeZone)}
                    </td>

                    {/* Action Buttons */}
                    <td className="w-[210px] whitespace-nowrap py-3 pr-3 pl-2 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        {/* Edit */}
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isJobBusy || isCompiling}
                          title={
                            isCompiling
                              ? 'Cannot edit monitor while selector compilation is in progress'
                              : isRunning
                                ? 'Cannot edit monitor while extraction is in progress'
                                : 'Edit monitor configuration'
                          }
                          aria-label="Edit monitor configuration"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={() => onEditJob(job)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>

                        {/* Run immediate */}
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isJobBusy || isCompiling}
                          title={
                            isCompiling
                              ? 'Cannot run extraction while selector compilation is in progress'
                              : isRunning
                                ? 'Executing extraction...'
                                : isJobBusy
                                  ? 'Action in progress...'
                                  : 'Run immediate extraction'
                          }
                          aria-label="Run immediate extraction"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={async () => {
                            const confirmed = await modal.confirm({
                              title: 'Run Immediate Extraction',
                              message: `Are you sure you want to run an immediate extraction for this monitor?\n${job.url}`,
                              confirmLabel: 'Run Extraction',
                              cancelLabel: 'Cancel',
                              variant: 'default',
                            });
                            if (confirmed) {
                              void handleAction(job.id, 'run', () =>
                                triggerJobMutation.mutateAsync(job.id)
                              );
                            }
                          }}
                        >
                          {isRunning ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
                          ) : (
                            <Zap className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        {/* History & Diffs */}
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isDeleting}
                          title="View snapshots, compiled selectors and diff history"
                          aria-label="View snapshots, compiled selectors and diff history"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={() => onSelectJobForHistory(job)}
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>

                        {/* Recompile */}
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isJobBusy || isCompiling}
                          title={
                            isCompiling
                              ? 'Compilation is already in progress'
                              : isRunning
                                ? 'Cannot recompile while extraction is running'
                                : 'Recompile selectors'
                          }
                          aria-label="Recompile selectors"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={async () => {
                            const confirmed = await modal.confirm({
                              title: 'Recompile Selectors',
                              message: `Are you sure you want to recompile the AI extraction selectors for this monitor?\n${job.url}`,
                              confirmLabel: 'Recompile',
                              cancelLabel: 'Cancel',
                              variant: 'default',
                            });
                            if (confirmed) {
                              void handleAction(job.id, 'recompile', () =>
                                recompileJobMutation.mutateAsync(job.id)
                              );
                            }
                          }}
                        >
                          {isCompiling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        {/* Pause/Resume */}
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isJobBusy || isCompiling}
                          title={
                            isCompiling
                              ? 'Schedule is suspended during compilation'
                              : isRunning
                                ? 'Cannot change schedule state while extraction is running'
                                : isPaused
                                  ? 'Resume schedule'
                                  : 'Pause schedule'
                          }
                          aria-label={isPaused ? 'Resume schedule' : 'Pause schedule'}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={async () => {
                            const actionTitle = isPaused ? 'Resume Schedule' : 'Pause Schedule';
                            const actionVerb = isPaused ? 'resume' : 'pause';
                            const confirmed = await modal.confirm({
                              title: actionTitle,
                              message: `Are you sure you want to ${actionVerb} the extraction schedule for this monitor?\n${job.url}`,
                              confirmLabel: actionTitle,
                              cancelLabel: 'Cancel',
                              variant: 'default',
                            });
                            if (confirmed) {
                              void handleAction(job.id, 'pause', () =>
                                togglePauseMutation.mutateAsync({
                                  jobId: job.id,
                                  paused: !isPaused,
                                })
                              );
                            }
                          }}
                        >
                          {isPausing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
                          ) : isPaused ? (
                            <Play className="h-3.5 w-3.5 text-foreground" />
                          ) : (
                            <Pause className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        {/* Delete */}
                        <Button
                          variant="ghost"
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
                          className="h-7 w-7 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-muted"
                          onClick={async () => {
                            const confirmed = await modal.confirm({
                              title: 'Delete Monitor',
                              message: `Are you sure you want to permanently delete this monitor?\n${job.url}`,
                              confirmLabel: 'Delete',
                              cancelLabel: 'Cancel',
                              variant: 'destructive',
                            });
                            if (confirmed) {
                              void handleAction(job.id, 'delete', () =>
                                deleteJobMutation.mutateAsync(job.id)
                              );
                            }
                          }}
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
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
    </div>
  );
}
