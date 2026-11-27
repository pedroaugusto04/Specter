import { RunPhase, USER_FAILURES } from '@specter/contracts';
import type { BullMqJobScheduler } from './queues.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { RealtimeService } from '../services/realtimeService.js';
import { CompilationReason } from './scheduler.interface.js';
import { JobStatus } from '../types/enums.js';
import { env } from '../config/env.js';
import { buildFailedRunUpdate } from '../mappers/runBuilder.js';

export async function reconcileRuns(
  repo: IJobRepository,
  scheduler: BullMqJobScheduler,
  realtime: RealtimeService
): Promise<void> {
  for (const run of await repo.findRunningRuns()) {
    const job = await repo.findById(run.jobId);
    if (!job) continue;

    if (
      job.updatedAt.getTime() !== run.monitorUpdatedAt?.getTime() ||
      (job.status !== JobStatus.Active && job.status !== JobStatus.Recovering)
    ) {
      await repo.cancelRuns(job.id);
      await realtime.notifyJobRunCompleted(job.userId, job.id, run.id, run.hasChanges);
      continue;
    }

    const recovering = run.phase === RunPhase.Recovering;
    const queue = recovering ? scheduler.compilationQueue : scheduler.scrapeQueue;
    const taskId = recovering
      ? `recover-${run.id}`
      : `run-${run.id}-${run.metadata!.accessAttempts}`;
    // A worker may still be finishing the originating delivery when maintenance runs.
    const taskIds = [...new Set([run.originQueueId, taskId].filter((id): id is string => !!id))];
    const knownTasks = await Promise.all(taskIds.map((id) => queue.getJob(id)));
    const inFlightStates = new Set(['active', 'wait', 'delayed', 'prioritized']);
    const inFlight = (await Promise.all(knownTasks.map((task) => task?.getState()))).some(
      (state) => state !== undefined && inFlightStates.has(state)
    );

    if (
      Date.now() - run.startedAt!.getTime() >= env.RUN_MAX_DURATION_MS ||
      (!inFlight &&
        recovering &&
        run.metadata!.compilationAttempts >= env.COMPILATION_QUEUE_MAX_ATTEMPTS)
    ) {
      const message = USER_FAILURES.requestedDataUnavailable.description;
      const completed = await repo.commitRun(
        buildFailedRunUpdate(run, message),
        [],
        {
          status: recovering ? JobStatus.Failed : JobStatus.Active,
          lastError: message,
        },
        job.updatedAt
      );
      if (recovering) await scheduler.removeRepeatableJob(job.id, job.bullmqRepeatableKey);
      await realtime.notifyJobRunCompleted(job.userId, job.id, completed.id, completed.hasChanges);
      await realtime.notifyJobUpdated(job.userId, job.id);
      continue;
    }

    if (inFlight) continue;

    const old = knownTasks[taskIds.indexOf(taskId)];
    if (old) {
      const state = await old.getState();
      if (state !== 'failed' && state !== 'completed') continue;
      await old.remove();
    }

    if (recovering) {
      await scheduler.enqueueCompilation(job.id, CompilationReason.Recovery, run.id);
    } else {
      await scheduler.enqueueRunAttempt(
        job.id,
        run.id,
        run.metadata!.accessAttempts,
        run.nextAttemptAt ?? new Date()
      );
    }
  }
}
