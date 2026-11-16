import { Queue, type ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { CompilationReason, type IJobScheduler } from './scheduler.interface.js';
import { COMPILATION_BACKOFF_TYPE } from './compilationBackoff.js';

export const COMPILATION_QUEUE_NAME = 'compilation-queue';
export const SCRAPE_EXECUTION_QUEUE_NAME = 'scrape-execution-queue';
export const MAINTENANCE_QUEUE_NAME = 'maintenance-queue';

export function getRedisConnectionOptions(): ConnectionOptions {
  const parsed = new URL(env.REDIS_URL);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    maxRetriesPerRequest: null,
  };
}

export function buildRepeatableJobId(jobId: string): string {
  return `job-cron-${jobId}`;
}

export class BullMqJobScheduler implements IJobScheduler {
  public readonly compilationQueue: Queue;
  public readonly scrapeQueue: Queue;
  public readonly maintenanceQueue: Queue;

  constructor(
    connection: ConnectionOptions = getRedisConnectionOptions(),
    private readonly resolveTimezone?: (jobId: string) => Promise<string>
  ) {
    this.compilationQueue = new Queue(COMPILATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: env.COMPILATION_QUEUE_MAX_ATTEMPTS,
        backoff: {
          type: COMPILATION_BACKOFF_TYPE,
          delay: env.SCRAPE_RETRY_DELAY_MS,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });

    this.scrapeQueue = new Queue(SCRAPE_EXECUTION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: env.SCRAPE_MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: env.SCRAPE_RETRY_DELAY_MS,
        },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    });

    this.maintenanceQueue = new Queue(MAINTENANCE_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 20,
        removeOnFail: 50,
      },
    });
  }

  async enqueueCompilation(
    jobId: string,
    reason: CompilationReason,
    runId?: string
  ): Promise<void> {
    await this.compilationQueue.add(
      'compile-job',
      { jobId, reason, runId },
      {
        jobId: runId ? `recover-${runId}` : `compile-${jobId}-${Date.now()}`,
      }
    );
    logger.info('Enqueued job compilation task', { jobId, reason });
  }

  async enqueueRunAttempt(jobId: string, runId: string, attempt: number, at: Date): Promise<void> {
    await this.scrapeQueue.add(
      'scrape-job',
      { jobId, runId },
      {
        jobId: `run-${runId}-${attempt}`,
        delay: Math.max(0, at.getTime() - Date.now()),
      }
    );
  }

  async removePendingCompilations(jobId: string): Promise<void> {
    const jobs = await this.compilationQueue.getJobs([
      'waiting',
      'delayed',
      'prioritized',
      'active',
    ]);
    for (const job of jobs) {
      if (job.data?.jobId === jobId) {
        try {
          await job.remove();
          logger.info('Removed pending compilation job from Redis queue', {
            jobId,
            queueJobId: job.id,
          });
        } catch {
          // Job might be currently being processed or already completed
        }
      }
    }
  }

  async enqueueImmediateScrape(jobId: string): Promise<void> {
    await this.scrapeQueue.add(
      'scrape-job',
      { jobId, trigger: 'manual' },
      {
        jobId: `scrape-manual-${jobId}-${Date.now()}`,
      }
    );
    logger.info('Enqueued manual scrape task', { jobId });
  }

  async scheduleRepeatableJob(jobId: string, cronExpression: string): Promise<string | null> {
    const repeatableJobId = buildRepeatableJobId(jobId);
    const timezone = await this.resolveTimezone?.(jobId);

    const job = await this.scrapeQueue.add(
      'scrape-job',
      { jobId, trigger: 'cron' },
      {
        jobId: repeatableJobId,
        repeat: {
          pattern: cronExpression,
          ...(timezone ? { tz: timezone } : {}),
        },
      }
    );

    const repeatJobKey = job.repeatJobKey ?? repeatableJobId;
    logger.info('Scheduled repeatable scrape job', {
      jobId,
      cronExpression,
      repeatJobKey,
    });

    return repeatJobKey;
  }

  async removeRepeatableJob(jobId: string, repeatableKey?: string | null): Promise<void> {
    const targetId = buildRepeatableJobId(jobId);
    const repeatables = await this.scrapeQueue.getRepeatableJobs();

    for (const item of repeatables) {
      if (
        item.id === targetId ||
        (repeatableKey && item.key === repeatableKey) ||
        item.key.includes(jobId)
      ) {
        await this.scrapeQueue.removeRepeatableByKey(item.key);
        logger.info('Removed repeatable scrape job from Redis', {
          jobId,
          repeatableKey: item.key,
        });
      }
    }
  }

  async scheduleRunReconciliation(): Promise<void> {
    const repeatable = await this.maintenanceQueue.getRepeatableJobs();
    for (const job of repeatable) {
      if (job.id === 'reconcile-runs' || job.name === 'reconcile-runs') {
        await this.maintenanceQueue.removeRepeatableByKey(job.key);
      }
    }
    await this.maintenanceQueue.add(
      'reconcile-runs',
      {},
      {
        jobId: 'reconcile-runs',
        repeat: {
          every: env.RUN_RECONCILE_INTERVAL_MS,
        },
      }
    );
  }

  async scheduleDailyRetentionPruning(): Promise<void> {
    const repeatable = await this.maintenanceQueue.getRepeatableJobs();
    for (const job of repeatable) {
      if (job.id === 'daily-retention-pruning' || job.name === 'prune-unchanged-runs') {
        await this.maintenanceQueue.removeRepeatableByKey(job.key);
      }
    }
    await this.maintenanceQueue.add(
      'prune-unchanged-runs',
      {},
      {
        jobId: 'daily-retention-pruning',
        repeat: {
          pattern: '0 3 * * *', // Daily at 03:00 AM
        },
      }
    );
  }

  async close(): Promise<void> {
    await Promise.allSettled([
      this.compilationQueue.close(),
      this.scrapeQueue.close(),
      this.maintenanceQueue.close(),
    ]);
  }
}
