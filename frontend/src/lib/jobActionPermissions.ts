import type { ScrapingJobDto } from '@/lib/api';
import { JOB_STATUS } from '@/lib/domainValues';
import { formatDateTime } from '@/lib/utils';

export type JobRowActionType = 'run' | 'recompile' | 'pause' | 'delete';

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
    job.status === JOB_STATUS.PendingCompilation ||
    job.status === JOB_STATUS.Healing ||
    currentAction === 'recompile';
  const isRunning = isExecutingExtraction || currentAction === 'run';
  const isPaused = job.status === JOB_STATUS.Paused;
  const isFailed = job.status === JOB_STATUS.Failed;
  const isAccessBlocked = Boolean(
    job.accessState?.retryAt && new Date(job.accessState.retryAt).getTime() > Date.now()
  );

  // Edit Action
  let editDisabled = isJobBusy || isCompiling || isRunning;
  let editTitle = 'Edit monitor configuration';
  if (isCompiling) {
    editTitle = 'Cannot edit monitor while selector compilation is in progress';
  } else if (isRunning) {
    editTitle = 'Cannot edit monitor while extraction is in progress';
  } else if (isJobBusy) {
    editTitle = 'Action in progress...';
  }

  // Run Immediate Action
  let runDisabled = isJobBusy || isCompiling || isRunning || isFailed || isAccessBlocked;
  let runTitle = 'Run immediate extraction';
  if (isCompiling) {
    runTitle = 'Cannot run extraction while selector compilation is in progress';
  } else if (isRunning) {
    runTitle = 'Executing extraction...';
  } else if (isFailed) {
    runTitle = 'Cannot run extraction on a failed monitor. Please recompile selectors or edit the monitor.';
  } else if (isAccessBlocked && job.accessState?.retryAt) {
    runTitle = `Target access is currently blocked. Next attempt allowed after ${formatDateTime(
      job.accessState.retryAt,
      timeZone
    )}`;
  } else if (isJobBusy) {
    runTitle = 'Action in progress...';
  }

  // Recompile Action
  let recompileDisabled = isJobBusy || isCompiling || isRunning;
  let recompileTitle = 'Recompile selectors';
  if (isCompiling) {
    recompileTitle = 'Compilation is already in progress';
  } else if (isRunning) {
    recompileTitle = 'Cannot recompile while extraction is running';
  } else if (isJobBusy) {
    recompileTitle = 'Action in progress...';
  }

  // Pause / Resume Action
  let pauseDisabled = isJobBusy || isCompiling || isRunning || isFailed;
  let pauseTitle = isPaused ? 'Resume schedule' : 'Pause schedule';
  if (isFailed) {
    pauseTitle = 'Cannot change schedule on a failed monitor. Please recompile or fix the monitor first.';
  } else if (isCompiling) {
    pauseTitle = 'Schedule is suspended during compilation';
  } else if (isRunning) {
    pauseTitle = 'Cannot change schedule state while extraction is running';
  } else if (isJobBusy) {
    pauseTitle = 'Action in progress...';
  }

  // Delete Action
  let deleteDisabled = isJobBusy || isRunning;
  let deleteTitle = 'Delete monitor';
  if (isRunning) {
    deleteTitle = 'Cannot delete while extraction is in progress';
  } else if (currentAction === 'recompile') {
    deleteTitle = 'Cannot delete while recompile request is running';
  } else if (isJobBusy) {
    deleteTitle = 'Action in progress...';
  }

  return {
    edit: { disabled: editDisabled, title: editTitle },
    run: { disabled: runDisabled, title: runTitle },
    recompile: { disabled: recompileDisabled, title: recompileTitle },
    pause: { disabled: pauseDisabled, title: pauseTitle },
    delete: { disabled: deleteDisabled, title: deleteTitle },
  };
}
