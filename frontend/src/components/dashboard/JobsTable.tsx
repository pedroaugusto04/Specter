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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          ACTIVE
        </span>
      );
    case 'PENDING_COMPILATION':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-400">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
          AI COMPILING
        </span>
      );
    case 'HEALING':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          SELF-HEALING
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          FAILED
        </span>
      );
    case 'PAUSED':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
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
      // Status filter
      if (filter === 'ACTIVE' && job.status !== 'ACTIVE') return false;
      if (filter === 'HEALING' && job.status !== 'HEALING' && job.status !== 'PENDING_COMPILATION') {
        return false;
      }
      if (filter === 'PAUSED' && job.status !== 'PAUSED' && job.status !== 'FAILED') {
        return false;
      }

      // Search query
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
    <div className="rounded-xl border border-white/[0.08] bg-zinc-900/40 backdrop-blur-sm shadow-2xl overflow-hidden">
      {/* Table Action Bar */}
      <div className="border-b border-white/[0.08] bg-zinc-950/40 p-3.5 sm:px-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === 'ALL'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            All <span className="ml-1 font-mono text-[11px] opacity-60">{jobs.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('ACTIVE')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === 'ACTIVE'
                ? 'bg-zinc-800 text-emerald-400 shadow-xs'
                : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/40'
            }`}
          >
            Active <span className="ml-1 font-mono text-[11px] opacity-60">{activeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('HEALING')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === 'HEALING'
                ? 'bg-zinc-800 text-amber-400 shadow-xs'
                : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/40'
            }`}
          >
            AI / Healing <span className="ml-1 font-mono text-[11px] opacity-60">{healingCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('PAUSED')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === 'PAUSED'
                ? 'bg-zinc-800 text-zinc-300 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            Paused / Failed <span className="ml-1 font-mono text-[11px] opacity-60">{pausedOrFailedCount}</span>
          </button>
        </div>

        {/* Search & Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter monitors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-lg border border-white/[0.08] bg-zinc-900/80 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-700"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-8 shrink-0 text-xs gap-1.5 border-white/[0.08] bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Table Content */}
      {filteredJobs.length === 0 ? (
        <div className="py-16 px-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-zinc-950 text-zinc-400">
            <Search className="h-5 w-5 text-zinc-500" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-zinc-200">
            {searchQuery || filter !== 'ALL'
              ? 'No matching monitors found'
              : 'No monitors configured yet'}
          </h3>
          <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
            {searchQuery || filter !== 'ALL'
              ? 'Try clearing the search query or changing the status filter tab.'
              : 'Add your first target URL to begin autonomous extraction and real-time diff monitoring.'}
          </p>
          {onCreateClick && !searchQuery && filter === 'ALL' && (
            <div className="mt-5">
              <Button onClick={onCreateClick} size="sm" className="gap-1.5 shadow-xs">
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
              <tr className="border-b border-white/[0.06] text-[11px] font-medium uppercase tracking-wider text-zinc-400 bg-zinc-950/20">
                <th className="w-48 max-w-[220px] py-3 px-4">Target</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Schedule</th>
                <th className="px-3 py-3">Failures</th>
                <th className="px-3 py-3">Last Checked</th>
                <th className="py-3 pr-4 pl-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
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
                    className="group hover:bg-zinc-800/30 transition-colors"
                  >
                    {/* Target & Prompt */}
                    <td className="w-48 max-w-[220px] py-3 px-4">
                      <div className="flex items-center gap-1.5 font-medium text-zinc-100 min-w-0">
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          title={job.url}
                          className="truncate hover:text-cyan-400 hover:underline transition-colors"
                        >
                          {job.url}
                        </a>
                        <ExternalLink className="h-3 w-3 shrink-0 text-zinc-500 opacity-60 group-hover:opacity-100" />
                      </div>
                      <p
                        className="mt-0.5 truncate text-xs text-zinc-400"
                        title={job.userPrompt}
                      >
                        {job.userPrompt}
                      </p>
                      {parsedError && (
                        <div
                          className="mt-1 flex items-center gap-1.5 rounded border border-red-500/20 bg-red-950/30 px-2 py-0.5 text-[11px] text-red-400 min-w-0"
                          title={parsedError.description}
                        >
                          <ShieldAlert className="h-3 w-3 shrink-0 text-red-400" />
                          <span className="truncate">
                            {parsedError.title}: {parsedError.description}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Status Pill */}
                    <td className="whitespace-nowrap px-3 py-3">
                      {renderStatusPill(job.status)}
                    </td>

                    {/* Cron */}
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-zinc-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-zinc-500" />
                        {job.cronExpression}
                      </span>
                    </td>

                    {/* Failures */}
                    <td className="whitespace-nowrap px-3 py-3 text-xs">
                      <span
                        className={
                          job.failureCount > 0
                            ? 'font-mono font-semibold text-amber-400'
                            : 'font-mono text-zinc-500'
                        }
                      >
                        {job.failureCount}
                      </span>
                    </td>

                    {/* Updated At */}
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-400 font-mono">
                      {formatDateTime(job.updatedAt)}
                    </td>

                    {/* Action Buttons */}
                    <td className="whitespace-nowrap py-3 pr-4 pl-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {/* Edit */}
                        <Button
                          variant="ghost"
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
                          className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
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
                              ? 'Cannot run extraction while AI selector compilation is in progress'
                              : isRunning
                                ? 'Executing extraction...'
                                : isJobBusy
                                  ? 'Action in progress...'
                                  : 'Run immediate extraction'
                          }
                          aria-label="Run immediate extraction"
                          className="h-7 w-7 text-zinc-400 hover:text-amber-400 hover:bg-zinc-800"
                          onClick={() =>
                            handleAction(job.id, 'run', () => api.triggerNow(job.id))
                          }
                        >
                          {isRunning ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
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
                          className="h-7 w-7 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-800"
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
                              ? 'AI compilation is already in progress'
                              : isRunning
                                ? 'Cannot recompile while extraction is running'
                                : 'Force AI re-compilation of selectors'
                          }
                          aria-label="Force AI re-compilation of selectors"
                          className="h-7 w-7 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800"
                          onClick={() =>
                            handleAction(job.id, 'recompile', () =>
                              api.triggerRecompile(job.id)
                            )
                          }
                        >
                          {isCompiling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
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
                              ? 'Schedule is suspended during AI compilation'
                              : isRunning
                                ? 'Cannot change schedule state while extraction is running'
                                : isPaused
                                  ? 'Resume schedule'
                                  : 'Pause schedule'
                          }
                          aria-label={isPaused ? 'Resume schedule' : 'Pause schedule'}
                          className="h-7 w-7 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800"
                          onClick={() =>
                            handleAction(job.id, 'pause', () =>
                              api.togglePause(job.id, !isPaused)
                            )
                          }
                        >
                          {isPausing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                          ) : isPaused ? (
                            <Play className="h-3.5 w-3.5 text-emerald-400" />
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
                          className="h-7 w-7 text-zinc-400 hover:text-red-400 hover:bg-zinc-800"
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
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
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
