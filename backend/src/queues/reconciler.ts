import type { Queue } from 'bullmq';
import { logger } from '../utils/logger.js';
import { buildRepeatableJobId } from './queues.js';

export interface ReconcilableJob {
  id: string;
  cronExpression: string;
}

export interface ReconciliationResult {
  removedOrphanKeys: string[];
  scheduledMissingJobIds: string[];
}

/**
 * Reconciles active jobs in PostgreSQL with repeatable jobs registered in Redis/BullMQ.
 * 1. Removes orphan repeatable jobs in Redis that no longer correspond to an ACTIVE job in PostgreSQL.
 * 2. Registers repeatable jobs for ACTIVE database jobs that are missing in Redis.
 */
export async function reconcileRepeatableJobs(
  queue: Pick<Queue, 'getRepeatableJobs' | 'removeRepeatableByKey' | 'add'>,
  activeJobsFromDb: ReconcilableJob[]
): Promise<ReconciliationResult> {
  const existingRepeatables = await queue.getRepeatableJobs();
  const expectedMap = new Map<string, ReconcilableJob>();

  for (const job of activeJobsFromDb) {
    expectedMap.set(buildRepeatableJobId(job.id), job);
  }

  const removedOrphanKeys: string[] = [];
  const presentRepeatableIds = new Set<string>();

  for (const repeatable of existingRepeatables) {
    const repId = repeatable.id ?? '';
    const matchingDbJob = expectedMap.get(repId);

    if (!matchingDbJob || repeatable.pattern !== matchingDbJob.cronExpression) {
      await queue.removeRepeatableByKey(repeatable.key);
      removedOrphanKeys.push(repeatable.key);
    } else {
      presentRepeatableIds.add(repId);
    }
  }

  const scheduledMissingJobIds: string[] = [];

  for (const [repId, dbJob] of expectedMap.entries()) {
    if (!presentRepeatableIds.has(repId)) {
      await queue.add(
        'scrape-job',
        { jobId: dbJob.id, trigger: 'cron' },
        {
          jobId: repId,
          repeat: {
            pattern: dbJob.cronExpression,
          },
        }
      );
      scheduledMissingJobIds.push(dbJob.id);
    }
  }

  logger.info('BullMQ repeatable jobs reconciliation completed', {
    removedOrphansCount: removedOrphanKeys.length,
    scheduledMissingCount: scheduledMissingJobIds.length,
  });

  return {
    removedOrphanKeys,
    scheduledMissingJobIds,
  };
}
