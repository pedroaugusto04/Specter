import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closeDb } from './db/index.js';
import { createCompilerProvider } from './providers/compilers/compiler.factory.js';
import { createNotificationProvider } from './providers/notifications/notification.factory.js';
import { NotificationDispatcher } from './providers/notifications/notificationDispatcher.js';
import { TelegramNotificationProvider } from './providers/notifications/telegramNotification.provider.js';
import { WebhookNotificationProvider } from './providers/notifications/webhookNotification.provider.js';
import { createScraperEngine } from './providers/scraping/scraper.factory.js';
import { BullMqJobScheduler } from './queues/queues.js';
import { reconcileRepeatableJobs } from './queues/reconciler.js';
import { DrizzleIntegrationRepository } from './repositories/integrationRepository.js';
import { DrizzleJobRepository } from './repositories/jobRepository.js';
import { DrizzleUserRepository } from './repositories/userRepository.js';
import { AuthService } from './services/authService.js';
import { CompilationService } from './services/compilationService.js';
import { IntegrationService } from './services/integrationService.js';
import { JobService } from './services/jobService.js';
import { RetentionService } from './services/retentionService.js';
import { ScrapeExecutionService } from './services/scrapeExecutionService.js';
import { logger } from './utils/logger.js';
import { WorkerManager } from './workers/workers.js';

async function bootstrap(): Promise<void> {
  const jobRepository = new DrizzleJobRepository();
  const userRepository = new DrizzleUserRepository();
  const integrationRepository = new DrizzleIntegrationRepository();
  const jobScheduler = new BullMqJobScheduler();
  const compilerProvider = createCompilerProvider();
  const scraperEngine = createScraperEngine();

  const emailNotificationProvider = createNotificationProvider();
  const telegramProvider = new TelegramNotificationProvider();
  const webhookProvider = new WebhookNotificationProvider();

  const notificationDispatcher = new NotificationDispatcher({
    emailProvider: emailNotificationProvider,
    telegramProvider,
    webhookProvider,
    integrationRepository,
  });

  const compilationService = new CompilationService({
    jobRepository,
    scraperEngine,
    compilerProvider,
    notificationProvider: notificationDispatcher,
    jobScheduler,
  });

  const scrapeExecutionService = new ScrapeExecutionService({
    jobRepository,
    scraperEngine,
    notificationProvider: notificationDispatcher,
    jobScheduler,
  });

  const retentionService = new RetentionService(jobRepository);
  const jobService = new JobService(jobRepository, jobScheduler, scraperEngine);
  const authService = new AuthService(userRepository);
  const integrationService = new IntegrationService(
    integrationRepository,
    telegramProvider,
    webhookProvider
  );

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

  const app = await buildApp({ jobService, authService, integrationService });

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

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`Specter Backend API is running on http://${env.HOST}:${env.PORT}`, {
      port: env.PORT,
      host: env.HOST,
      environment: env.NODE_ENV,
    });
  } catch (error) {
    logger.error('Failed to bind server port', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  logger.error('Fatal startup bootstrap crash', {
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
