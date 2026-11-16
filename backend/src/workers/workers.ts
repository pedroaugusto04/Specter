import { DomainError } from '../errors/domainErrors.js';
import { ExecutionLease } from '../queues/executionLease.js';
import { compilationBackoff } from '../queues/compilationBackoff.js';
import { Worker, UnrecoverableError, type Job } from 'bullmq';
import { env } from '../config/env.js';
import {
  COMPILATION_QUEUE_NAME,
  getRedisConnectionOptions,
  MAINTENANCE_QUEUE_NAME,
  SCRAPE_EXECUTION_QUEUE_NAME,
} from '../queues/queues.js';
import type { CompilationService } from '../services/compilationService.js';
import type { RetentionService } from '../services/retentionService.js';
import type { ScrapeExecutionService } from '../services/scrapeExecutionService.js';
import { logger } from '../utils/logger.js';
import type { CompilationReason } from '../queues/scheduler.interface.js';

export interface WorkerManagerDeps {
  reconcileRuns?: () => Promise<void>;
  compilationService: CompilationService;
  scrapeExecutionService: ScrapeExecutionService;
  retentionService: RetentionService;
}

export class WorkerManager {
  private readonly executionLease = new ExecutionLease();
  private compilationWorker: Worker | null = null;
  private scrapeWorker: Worker | null = null;
  private maintenanceWorker: Worker | null = null;
  private readonly deps: WorkerManagerDeps;

  constructor(deps: WorkerManagerDeps) {
    this.deps = deps;
  }

  start(): void {
    const connection = getRedisConnectionOptions();

    this.compilationWorker = new Worker(
      COMPILATION_QUEUE_NAME,
      async (job: Job<{ jobId: string; reason?: CompilationReason; runId?: string }>) => {
        const { jobId, reason } = job.data;
        await this.runMonitor(jobId, () =>
          this.deps.compilationService.compileJob(
            jobId,
            reason,
            job.attemptsMade + 1 < (job.opts.attempts ?? 1),
            job.data.runId
          )
        );
      },
      {
        concurrency: env.COMPILER_CONCURRENCY,
        connection,
        lockDuration: env.COMPILER_TIMEOUT_MS,
        settings: {
          backoffStrategy: (attemptsMade, _type, error) =>
            compilationBackoff(attemptsMade, error, env.COMPILER_RATE_LIMIT_RETRY_DELAY_MS),
        },
      }
    );

    this.scrapeWorker = new Worker(
      SCRAPE_EXECUTION_QUEUE_NAME,
      async (job: Job<{ jobId: string; runId?: string }>) => {
        const { jobId } = job.data;
        await this.runMonitor(jobId, () =>
          this.deps.scrapeExecutionService.executeScrape(jobId, job.id, job.data.runId)
        );
      },
      {
        concurrency: env.SCRAPER_CONCURRENCY,
        connection,
        lockDuration: env.COMPILER_TIMEOUT_MS,
      }
    );

    this.maintenanceWorker = new Worker(
      MAINTENANCE_QUEUE_NAME,
      async () => {
        await this.deps.reconcileRuns?.();
        await this.deps.retentionService.pruneUnchangedSnapshots();
      },
      {
        concurrency: 1,
        connection,
      }
    );

    this.compilationWorker.on('failed', (job, err) => {
      logger.error('Compilation worker job failed', {
        jobId: job?.data?.jobId,
        errorMessage: err.message,
      });
    });

    this.compilationWorker.on('error', (err) => {
      logger.error('Compilation worker Redis connection error', {
        errorMessage: err.message,
      });
    });

    this.scrapeWorker.on('failed', (job, err) => {
      logger.error('Scrape worker job failed', {
        jobId: job?.data?.jobId,
        errorMessage: err.message,
      });
    });

    this.scrapeWorker.on('error', (err) => {
      logger.error('Scrape worker Redis connection error', {
        errorMessage: err.message,
      });
    });

    this.maintenanceWorker.on('error', (err) => {
      logger.error('Maintenance worker Redis connection error', {
        errorMessage: err.message,
      });
    });

    logger.info('BullMQ background workers started', {
      compilerConcurrency: env.COMPILER_CONCURRENCY,
      scraperConcurrency: env.SCRAPER_CONCURRENCY,
    });
  }

  private async runMonitor<T>(
    jobId: string,
    action: () => Promise<T>,
    shouldSkip?: () => Promise<boolean>
  ) {
    try {
      return await this.executionLease.run(jobId, action, shouldSkip);
    } catch (error) {
      if (error instanceof DomainError && !error.isRetryable)
        throw new UnrecoverableError(error.message);
      throw error;
    }
  }

  async stop(): Promise<void> {
    await Promise.allSettled([
      this.compilationWorker?.close(),
      this.scrapeWorker?.close(),
      this.maintenanceWorker?.close(),
    ]);
    await this.executionLease.close();
    logger.info('BullMQ background workers stopped');
  }
}
