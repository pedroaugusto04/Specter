import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closeDb } from './db/index.js';
import { createCompilerProvider } from './providers/compilers/compiler.factory.js';
import { createNotificationProvider } from './providers/notifications/notification.factory.js';
import { createScraperEngine } from './providers/scraping/scraper.factory.js';
import { BullMqJobScheduler } from './queues/queues.js';
import { reconcileRepeatableJobs } from './queues/reconciler.js';
import { DrizzleJobRepository } from './repositories/jobRepository.js';
import { CompilationService } from './services/compilationService.js';
import { JobService } from './services/jobService.js';
import { RetentionService } from './services/retentionService.js';
import { ScrapeExecutionService } from './services/scrapeExecutionService.js';
import { logger } from './utils/logger.js';
import { WorkerManager } from './workers/workers.js';

async function bootstrap(): Promise<void> {
  const jobRepository = new DrizzleJobRepository();
  const jobScheduler = new BullMqJobScheduler();
  const compilerProvider = createCompilerProvider();
  const scraperEngine = createScraperEngine();
  const notificationProvider = createNotificationProvider();

  const compilationService = new CompilationService({
    jobRepository,
    scraperEngine,
    compilerProvider,
    notificationProvider,
    jobScheduler,
  });

  const scrapeExecutionService = new ScrapeExecutionService({
    jobRepository,
    scraperEngine,
    notificationProvider,
    jobScheduler,
  });

  const retentionService = new RetentionService(jobRepository);
  const jobService = new JobService(jobRepository, jobScheduler);

  // Run migrations automatically on startup
  try {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const { getDb } = await import('./db/index.js');
    await migrate(getDb(), { migrationsFolder: 'drizzle/migrations' });
    logger.info('Database migrations applied successfully.');
  } catch (err) {
    logger.warn('Database migration skipped or failed', {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  // Reconcile PostgreSQL active jobs with BullMQ repeatable schedules on startup
  try {
    const activeJobs = await jobRepository.findActiveJobs();
    await reconcileRepeatableJobs(
      jobScheduler.scrapeQueue,
      activeJobs.map((j) => ({ id: j.id, cronExpression: j.cronExpression }))
    );
    await jobScheduler.scheduleDailyRetentionPruning();
  } catch (err) {
    logger.warn('Startup job reconciliation skipped or failed (database/redis may still be starting)', {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  const workerManager = new WorkerManager({
    compilationService,
    scrapeExecutionService,
    retentionService,
  });
  workerManager.start();

  const app = await buildApp({ jobService });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    await app.close();
    await workerManager.stop();
    await jobScheduler.close();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(`Backend server listening on http://${env.HOST}:${env.PORT}`, {
    compilerProvider: compilerProvider.name,
    scraperEngine: scraperEngine.name,
    notificationProvider: notificationProvider.name,
  });
}

bootstrap().catch((err) => {
  logger.error('Fatal error during application bootstrap', {
    errorMessage: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
