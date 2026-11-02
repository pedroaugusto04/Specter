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
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useModal } from '@/components/ui/modal-dialog';
import { api, type JobStatus, type ScrapingJobDto } from '@/lib/api';
import { formatDateTime, parseErrorMessage } from '@/lib/utils';

type RowActionType = 'run' | 'recompile' | 'pause' | 'delete';
type StatusFilter = 'ALL' | 'ACTIVE' | 'HEALING' | 'PAUSED';

function renderStatusPill(status: JobStatus) {
  switch (status) {
    case 'ACTIVE':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-900 bg-zinc-900 px-2.5 py-1 font-mono text-xs font-medium tracking-wider text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          ACTIVE
        </span>
      );
    case 'PENDING_COMPILATION':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 font-mono text-xs font-medium tracking-wider text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground animate-ping" />
          COMPILING
        </span>
      );
    case 'HEALING':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 font-mono text-xs font-medium tracking-wider text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground animate-pulse" />
          ADAPTING
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 font-mono text-xs font-medium tracking-wider text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          FAILED
        </span>
      );
    case 'PAUSED':
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
}: {
  jobs: ScrapingJobDto[];
  onRefresh: () => void;
  isRefreshing?: boolean;
  onSelectJobForHistory: (job: ScrapingJobDto) => void;
  onEditJob: (job: ScrapingJobDto) => void;
  onCreateClick?: () => void;
}) {
  const [activeActions, setActiveActions] = React.useState<Record<string, RowActionType>>({});
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filter, setFilter] = React.useState<StatusFilter>('ALL');
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

  // Counts for filter tabs
  const activeCount = React.useMemo(() => jobs.filter((j) => j.status === 'ACTIVE').length, [jobs]);
  const healingCount = React.useMemo(
    () => jobs.filter((j) => j.status === 'HEALING' || j.status === 'PENDING_COMPILATION').length,
    [jobs]
  );
  const pausedOrFailedCount = React.useMemo(
    () => jobs.filter((j) => j.status === 'PAUSED' || j.status === 'FAILED').length,
    [jobs]
  );

  // Filtered jobs
  const filteredJobs = React.useMemo(() => {
    return jobs.filter((job) => {
      if (filter === 'ACTIVE' && job.status !== 'ACTIVE') return false;
      if (filter === 'HEALING' && job.status !== 'HEALING' && job.status !== 'PENDING_COMPILATION') {
        return false;
      }
      if (filter === 'PAUSED' && job.status !== 'PAUSED' && job.status !== 'FAILED') {
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
              filter === 'ALL'
                ? 'bg-card text-foreground shadow-2xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All <span className="ml-1.5 font-mono text-xs opacity-60">{jobs.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('ACTIVE')}
            className={`rounded px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              filter === 'ACTIVE'
                ? 'bg-card text-foreground shadow-2xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Active <span className="ml-1.5 font-mono text-xs opacity-60">{activeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('HEALING')}
            className={`rounded px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              filter === 'HEALING'
                ? 'bg-card text-foreground shadow-2xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Syncing <span className="ml-1.5 font-mono text-xs opacity-60">{healingCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('PAUSED')}
            className={`rounded px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              filter === 'PAUSED'
                ? 'bg-card text-foreground shadow-2xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Paused / Failed <span className="ml-1.5 font-mono text-xs opacity-60">{pausedOrFailedCount}</span>
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
            {searchQuery || filter !== 'ALL'
              ? 'No matching monitors'
              : 'No monitors configured'}
          </h3>
          <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
            {searchQuery || filter !== 'ALL'
              ? 'Try clearing the search query or switching the status filter.'
              : 'Create your first monitor to begin scheduled extraction and change detection.'}
          </p>
          {onCreateClick && !searchQuery && filter === 'ALL' && (
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
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="min-w-[240px] max-w-md py-3.5 px-4 sm:px-5">Target</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Schedule</th>
                <th className="px-4 py-3.5">Failures</th>
                <th className="px-4 py-3.5">Last Checked</th>
                <th className="py-3.5 pr-4 pl-3 sm:pr-5 text-right">Actions</th>
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
                  job.status === 'PENDING_COMPILATION' || job.status === 'HEALING';
                const isCompiling = isCompilingState || isRecompilingAction;
                const isPaused = job.status === 'PAUSED';
                const parsedError = job.lastError ? parseErrorMessage(job.lastError) : null;

                return (
                  <tr
                    key={job.id}
                    className="group hover:bg-muted/30 transition-colors"
                  >
                    {/* Target & Prompt */}
                    <td className="min-w-[240px] max-w-md py-4 px-4 sm:px-5">
                      <div className="flex items-center gap-2 font-medium text-foreground min-w-0">
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          title={job.url}
                          className="truncate hover:underline underline-offset-4 text-sm"
                        >
                          {job.url}
                        </a>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
                      </div>
                      <p
                        className="mt-1 line-clamp-2 text-xs sm:text-sm text-muted-foreground"
                        title={job.userPrompt}
                      >
                        {job.userPrompt}
                      </p>
                      {parsedError && (
                        <div
                          className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 min-w-0"
                          title={parsedError.description}
                        >
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {parsedError.title}: {parsedError.description}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Status Pill */}
                    <td className="whitespace-nowrap px-4 py-4">
                      {renderStatusPill(job.status)}
                    </td>

                    {/* Cron */}
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-xs sm:text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
                        {job.cronExpression}
                      </span>
                    </td>

                    {/* Failures */}
                    <td className="whitespace-nowrap px-4 py-4 text-xs sm:text-sm">
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
                    <td className="whitespace-nowrap px-4 py-4 text-xs sm:text-sm text-muted-foreground font-mono">
                      {formatDateTime(job.updatedAt)}
                    </td>

                    {/* Action Buttons */}
                    <td className="whitespace-nowrap py-4 pr-4 pl-3 sm:pr-5 text-right">
                      <div className="inline-flex items-center gap-1">
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
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={() => onEditJob(job)}
                        >
                          <Pencil className="h-4 w-4" />
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
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={() =>
                            handleAction(job.id, 'run', () => api.triggerNow(job.id))
                          }
                        >
                          {isRunning ? (
                            <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                        </Button>

                        {/* History & Diffs */}
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isDeleting}
                          title="View snapshots, compiled selectors and diff history"
                          aria-label="View snapshots, compiled selectors and diff history"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={() => onSelectJobForHistory(job)}
                        >
                          <History className="h-4 w-4" />
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
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={() =>
                            handleAction(job.id, 'recompile', () =>
                              api.triggerRecompile(job.id)
                            )
                          }
                        >
                          {isCompiling ? (
                            <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
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
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={() =>
                            handleAction(job.id, 'pause', () =>
                              api.togglePause(job.id, !isPaused)
                            )
                          }
                        >
                          {isPausing ? (
                            <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                          ) : isPaused ? (
                            <Play className="h-4 w-4 text-foreground" />
                          ) : (
                            <Pause className="h-4 w-4" />
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
                          className="h-8 w-8 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-muted"
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
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
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
