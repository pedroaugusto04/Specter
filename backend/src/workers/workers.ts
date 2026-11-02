import { Worker, type Job } from 'bullmq';
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

export interface WorkerManagerDeps {
  compilationService: CompilationService;
  scrapeExecutionService: ScrapeExecutionService;
  retentionService: RetentionService;
}

export class WorkerManager {
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
      async (job: Job<{ jobId: string; reason?: string }>) => {
        const { jobId } = job.data;
        await this.deps.compilationService.compileJob(jobId);
      },
      {
        concurrency: env.COMPILER_CONCURRENCY,
        connection,
        lockDuration: env.COMPILER_TIMEOUT_MS,
      }
    );

    this.scrapeWorker = new Worker(
      SCRAPE_EXECUTION_QUEUE_NAME,
      async (job: Job<{ jobId: string }>) => {
        const { jobId } = job.data;
        await this.deps.scrapeExecutionService.executeScrape(jobId);
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

    this.scrapeWorker.on('failed', (job, err) => {
      logger.error('Scrape worker job failed', {
        jobId: job?.data?.jobId,
        errorMessage: err.message,
      });
    });

    logger.info('BullMQ background workers started', {
      compilerConcurrency: env.COMPILER_CONCURRENCY,
      scraperConcurrency: env.SCRAPER_CONCURRENCY,
    });
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
