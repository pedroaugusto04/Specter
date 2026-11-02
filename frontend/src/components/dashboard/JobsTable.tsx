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
import { api, type DashboardStats, type JobStatus, type ScrapingJobDto } from '@/lib/api';
import { formatDateTime, parseErrorMessage } from '@/lib/utils';

type RowActionType = 'run' | 'recompile' | 'pause' | 'delete';
type StatusFilter = 'ALL' | 'ACTIVE' | 'HEALING' | 'PAUSED';

function renderStatusBadge(status: JobStatus) {
  switch (status) {
    case 'ACTIVE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Active
        </span>
      );
    case 'PENDING_COMPILATION':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Compiling
        </span>
      );
    case 'HEALING':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Healing
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Failed
        </span>
      );
    case 'PAUSED':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
          Paused
        </span>
      );
  }
}

export function JobsTable({
  jobs,
  stats,
  onRefresh,
  isRefreshing = false,
  onSelectJobForHistory,
  onEditJob,
  onCreateClick,
}: {
  jobs: ScrapingJobDto[];
  stats: DashboardStats | null;
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

  const activeCount = React.useMemo(() => jobs.filter((j) => j.status === 'ACTIVE').length, [jobs]);
  const healingCount = React.useMemo(
    () => jobs.filter((j) => j.status === 'HEALING' || j.status === 'PENDING_COMPILATION').length,
    [jobs]
  );
  const pausedOrFailedCount = React.useMemo(
    () => jobs.filter((j) => j.status === 'PAUSED' || j.status === 'FAILED').length,
    [jobs]
  );

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
        return job.url.toLowerCase().includes(query) || job.userPrompt.toLowerCase().includes(query);
      }

      return true;
    });
  }, [jobs, filter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Utilitarian Metrics Strip (Clean, inline, non-AI) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3 text-xs text-zinc-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-zinc-200">{stats?.totalJobs ?? jobs.length}</span>
            <span>monitors</span>
          </div>
          <span className="text-zinc-700">/</span>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="font-semibold text-zinc-200">{stats?.activeJobs ?? activeCount}</span>
            <span>active</span>
          </div>
          <span className="text-zinc-700">/</span>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="font-semibold text-zinc-200">{stats?.healingOrCompilingJobs ?? healingCount}</span>
            <span>healing</span>
          </div>
          <span className="text-zinc-700">/</span>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-zinc-200">{stats?.DetectedChangesCount ?? 0}</span>
            <span>diff alerts</span>
          </div>
        </div>

        <div className="text-zinc-500 font-mono text-[11px]">
          {stats?.totalRuns ?? 0} total extractions executed
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 border border-zinc-800 rounded-lg p-0.5 bg-zinc-900/60">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === 'ALL'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All ({jobs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('ACTIVE')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === 'ACTIVE'
                ? 'bg-zinc-800 text-emerald-400'
                : 'text-zinc-400 hover:text-emerald-400'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('HEALING')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === 'HEALING'
                ? 'bg-zinc-800 text-amber-400'
                : 'text-zinc-400 hover:text-amber-400'
            }`}
          >
            Healing ({healingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('PAUSED')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === 'PAUSED'
                ? 'bg-zinc-800 text-zinc-200'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Paused / Failed ({pausedOrFailedCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search monitors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-8 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-8 shrink-0 text-xs gap-1.5 border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden shadow-xs">
        {filteredJobs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-zinc-300">
              {searchQuery || filter !== 'ALL'
                ? 'No monitors match the current filter'
                : 'No monitors configured'}
            </p>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
              {searchQuery || filter !== 'ALL'
                ? 'Try resetting the search query or status filter.'
                : 'Add a website URL and extraction instructions to start autonomous monitoring.'}
            </p>
            {onCreateClick && !searchQuery && filter === 'ALL' && (
              <div className="mt-4">
                <Button onClick={onCreateClick} size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create First Monitor</span>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/40 text-zinc-400 font-medium">
                  <th className="py-2.5 px-4 w-48 max-w-[220px]">Target</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Frequency</th>
                  <th className="py-2.5 px-3">Failures</th>
                  <th className="py-2.5 px-3">Last Checked</th>
                  <th className="py-2.5 pr-4 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
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
                    <tr key={job.id} className="hover:bg-zinc-900/40 transition-colors">
                      {/* Target & Prompt */}
                      <td className="py-3 px-4 w-48 max-w-[220px]">
                        <div className="flex items-center gap-1.5 font-medium text-zinc-100 min-w-0">
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noreferrer"
                            title={job.url}
                            className="truncate hover:underline"
                          >
                            {job.url}
                          </a>
                          <ExternalLink className="h-3 w-3 shrink-0 text-zinc-500" />
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-zinc-400" title={job.userPrompt}>
                          {job.userPrompt}
                        </p>
                        {parsedError && (
                          <div
                            className="mt-1 flex items-center gap-1.5 rounded border border-red-900/60 bg-red-950/40 px-2 py-0.5 text-[11px] text-red-300 min-w-0"
                            title={parsedError.description}
                          >
                            <ShieldAlert className="h-3 w-3 shrink-0 text-red-400" />
                            <span className="truncate">
                              {parsedError.title}: {parsedError.description}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="whitespace-nowrap px-3 py-3">
                        {renderStatusBadge(job.status)}
                      </td>

                      {/* Frequency */}
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-zinc-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 text-zinc-500" />
                          {job.cronExpression}
                        </span>
                      </td>

                      {/* Failures */}
                      <td className="whitespace-nowrap px-3 py-3 font-mono">
                        <span className={job.failureCount > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-500'}>
                          {job.failureCount}
                        </span>
                      </td>

                      {/* Last Checked */}
                      <td className="whitespace-nowrap px-3 py-3 text-zinc-400 font-mono">
                        {formatDateTime(job.updatedAt)}
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap py-3 pr-4 pl-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isJobBusy || isCompiling}
                            title="Edit monitor configuration"
                            aria-label="Edit monitor configuration"
                            className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            onClick={() => onEditJob(job)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isJobBusy || isCompiling}
                            title="Run immediate extraction"
                            aria-label="Run immediate extraction"
                            className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            onClick={() => handleAction(job.id, 'run', () => api.triggerNow(job.id))}
                          >
                            {isRunning ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                            ) : (
                              <Zap className="h-3.5 w-3.5" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isDeleting}
                            title="View history and diffs"
                            aria-label="View history and diffs"
                            className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            onClick={() => onSelectJobForHistory(job)}
                          >
                            <History className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isJobBusy || isCompiling}
                            title="Force AI re-compilation"
                            aria-label="Force AI re-compilation"
                            className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            onClick={() => handleAction(job.id, 'recompile', () => api.triggerRecompile(job.id))}
                          >
                            {isCompiling ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isJobBusy || isCompiling}
                            title={isPaused ? 'Resume schedule' : 'Pause schedule'}
                            aria-label={isPaused ? 'Resume schedule' : 'Pause schedule'}
                            className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            onClick={() => handleAction(job.id, 'pause', () => api.togglePause(job.id, !isPaused))}
                          >
                            {isPausing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                            ) : isPaused ? (
                              <Play className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Pause className="h-3.5 w-3.5" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isJobBusy}
                            title="Delete monitor"
                            aria-label="Delete monitor"
                            className="h-7 w-7 text-zinc-400 hover:text-red-400 hover:bg-zinc-800"
                            onClick={async () => {
                              const confirmed = await modal.confirm({
                                title: 'Delete Monitor',
                                message: `Permanently delete this monitor?\n${job.url}`,
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
    </div>
  );
}
