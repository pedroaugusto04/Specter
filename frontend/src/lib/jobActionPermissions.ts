import type { ScrapingJobDto } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { JobStatus } from '@specter/contracts';

export type JobRowActionType = 'run' | 'recompile' | 'cancel-compilation' | 'pause' | 'delete';

export interface ActionPermissionItem {
  disabled: boolean;
  title: string;
}

export interface JobActionPermissions {
  edit: ActionPermissionItem;
  run: ActionPermissionItem;
  recompile: ActionPermissionItem;
  pause: ActionPermissionItem;
  delete: ActionPermissionItem;
}

export interface ResolveJobActionPermissionsInput {
  job: ScrapingJobDto;
  currentAction?: JobRowActionType;
  isExecutingExtraction: boolean;
  timeZone: string;
}

export function getJobActionPermissions({
  job,
  currentAction,
  isExecutingExtraction,
  timeZone,
}: ResolveJobActionPermissionsInput): JobActionPermissions {
  const isJobBusy = Boolean(currentAction);
  const isCompiling =
    job.status === JobStatus.PendingCompilation ||
    job.status === JobStatus.Recovering ||
    currentAction === 'recompile';
  const isRunning = isExecutingExtraction || currentAction === 'run';
  const isPaused = job.status === JobStatus.Paused;
  const isFailed = job.status === JobStatus.Failed;
  const retryAt = job.accessState?.retryAt;
  const isAccessBlocked = Boolean(retryAt && new Date(retryAt).getTime() > Date.now());

  const editDisabled = isJobBusy || isCompiling || isRunning;
  const editTitle = isCompiling
    ? 'Cannot edit monitor while selector compilation is in progress'
    : isRunning
      ? 'Cannot edit monitor while extraction is in progress'
      : isJobBusy
        ? 'Action in progress...'
        : 'Edit monitor configuration';

  const runDisabled = isJobBusy || isCompiling || isRunning || isFailed || isAccessBlocked;
  const runTitle = isCompiling
    ? 'Cannot run extraction while selector compilation is in progress'
    : isRunning
      ? 'Executing extraction...'
      : isFailed
        ? 'Cannot run extraction on a failed monitor. Please recompile selectors or edit the monitor.'
        : isAccessBlocked
          ? `Target access is currently blocked. Next attempt allowed after ${formatDateTime(retryAt!, timeZone)}`
          : isJobBusy
            ? 'Action in progress...'
            : 'Run immediate extraction';

  const recompileDisabled = (isJobBusy && currentAction !== 'recompile') || isRunning;
  const recompileTitle = isRunning
    ? 'Cannot recompile while extraction is running'
    : isJobBusy && currentAction !== 'recompile'
      ? 'Action in progress...'
      : isCompiling
        ? 'Stop compilation'
        : 'Recompile selectors';

  const pauseDisabled = (isJobBusy && currentAction !== 'recompile') || isRunning || isFailed;
  const pauseTitle = isFailed
    ? 'Cannot change schedule on a failed monitor. Please recompile or fix the monitor first.'
    : isCompiling
      ? 'Stop compilation and pause monitor'
      : isRunning
        ? 'Cannot change schedule state while extraction is running'
        : isJobBusy
          ? 'Action in progress...'
          : isPaused
            ? 'Resume schedule'
            : 'Pause schedule';

  const deleteDisabled = isJobBusy || isRunning;
  const deleteTitle = isRunning
    ? 'Cannot delete while extraction is in progress'
    : isJobBusy
      ? 'Action in progress...'
      : isCompiling
        ? 'Stop compilation and delete monitor'
        : 'Delete monitor';

  return {
    edit: { disabled: editDisabled, title: editTitle },
    run: { disabled: runDisabled, title: runTitle },
    recompile: { disabled: recompileDisabled, title: recompileTitle },
    pause: { disabled: pauseDisabled, title: pauseTitle },
    delete: { disabled: deleteDisabled, title: deleteTitle },
  };
}
