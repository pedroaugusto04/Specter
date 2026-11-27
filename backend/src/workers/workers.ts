import { DomainError } from '../errors/domainErrors.js';
import type { ExecutionLease } from '../queues/executionLease.js';
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
  executionLease: ExecutionLease;
  reconcileRuns: () => Promise<void>;
  compilationService: CompilationService;
  scrapeExecutionService: ScrapeExecutionService;
  retentionService: RetentionService;
}

export class WorkerManager {
  private compilationWorker: Worker | null = null;
  private scrapeWorker: Worker | null = null;
  private maintenanceWorker: Worker | null = null;

  constructor(private readonly deps: WorkerManagerDeps) {}

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
        lockDuration: env.EXTRACTION_TIMEOUT_MS + env.PLAYWRIGHT_TIMEOUT_MS,
      }
    );

    this.maintenanceWorker = new Worker(
      MAINTENANCE_QUEUE_NAME,
      async (job: Job) => {
        if (job.name === 'reconcile-runs') {
          await this.deps.reconcileRuns();
        } else if (job.name === 'prune-unchanged-runs') {
          await this.deps.retentionService.pruneUnchangedSnapshots();
        } else {
          await this.deps.reconcileRuns();
          await this.deps.retentionService.pruneUnchangedSnapshots();
        }
      },
      {
        concurrency: 1,
        connection,
      }
    );

    this.attachWorkerListeners(this.compilationWorker, 'Compilation');
    this.attachWorkerListeners(this.scrapeWorker, 'Scrape');
    this.attachWorkerListeners(this.maintenanceWorker, 'Maintenance');

    logger.info('BullMQ background workers started', {
      compilerConcurrency: env.COMPILER_CONCURRENCY,
      scraperConcurrency: env.SCRAPER_CONCURRENCY,
    });
  }

  private attachWorkerListeners(worker: Worker, label: string): void {
    worker.on('failed', (job, err) => {
      logger.error(`${label} worker job failed`, {
        jobId: (job?.data as { jobId?: string } | undefined)?.jobId,
        errorMessage: err.message,
      });
    });

    worker.on('error', (err) => {
      logger.error(`${label} worker Redis connection error`, {
        errorMessage: err.message,
      });
    });
  }

  private async runMonitor<T>(jobId: string, action: () => Promise<T>): Promise<T> {
    try {
      return await this.deps.executionLease.run(jobId, action);
    } catch (error) {
      if (error instanceof DomainError && !error.isRetryable) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    await Promise.allSettled([
      this.compilationWorker?.close(),
      this.scrapeWorker?.close(),
      this.maintenanceWorker?.close(),
    ]);
    logger.info('BullMQ background workers stopped');
  }
}
