import { ScheduleCoordinator } from './queues/scheduleCoordinator.js';
import { JobPresenter } from './presentation/jobPresenter.js';
import { BrowserCapacity } from './resources/browserCapacity.js';
import { RedisLeaseStore } from './resources/redisLeaseStore.js';
import { Redis } from 'ioredis';
import { AccessCooldownService } from './acquisition/cooldown.js';
import { RedisAccessCooldownStore } from './acquisition/redisCooldownStore.js';
import { createConfigurationModel } from './extraction/configurationModel.js';
import { composeExtraction } from './extraction/composition.js';
import { ConfigurationPipeline } from './extraction/configuration.js';

import { DrizzleOutboxRepository } from './repositories/outboxRepository.js';
import { OutboxWorker } from './notifications/outboxWorker.js';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closeDb } from './db/index.js';
import { createCompilerProvider } from './providers/compilers/compiler.factory.js';
import { createNotificationProvider } from './providers/notifications/notification.factory.js';
import { NotificationDispatcher } from './providers/notifications/notificationDispatcher.js';
import { TelegramNotificationProvider } from './providers/notifications/telegramNotification.provider.js';
import { WebhookNotificationProvider } from './providers/notifications/webhookNotification.provider.js';
import { createScraperEngine, createHttpCandidates } from './providers/scraping/scraper.factory.js';
import { logProviderQuotasOnStartup } from './providers/scraping/unblockers/index.js';
import { createStorageProvider } from './providers/storage/index.js';
import { createRealtimeEventBus } from './providers/realtime/realtime.factory.js';
import { BullMqJobScheduler } from './queues/queues.js';
import { CompilationReason } from './queues/scheduler.interface.js';
import { reconcilePendingCompilations, reconcileRepeatableJobs } from './queues/reconciler.js';
import { DrizzleIntegrationRepository } from './repositories/integrationRepository.js';
import { DrizzleJobRepository } from './repositories/jobRepository.js';
import { DrizzleSessionRepository } from './repositories/sessionRepository.js';
import { DrizzleUserRepository } from './repositories/userRepository.js';
import { DrizzleUsageRepository } from './repositories/usageRepository.js';
import { EnvPlanLimitResolver } from './services/quotas/envPlanLimitResolver.js';
import { QuotaService } from './services/quotaService.js';
import { AuthService } from './services/authService.js';
import { CompilationService } from './services/compilationService.js';
import { IntegrationService } from './services/integrationService.js';
import { JobService } from './services/jobService.js';
import { RealtimeService } from './services/realtimeService.js';
import { RetentionService } from './services/retentionService.js';
import { ScrapeExecutionService } from './services/scrapeExecutionService.js';
import { SessionService } from './services/sessionService.js';
import { logger } from './utils/logger.js';
import { JobStatus } from './types/enums.js';
import { WorkerManager } from './workers/workers.js';

async function bootstrap(): Promise<void> {
  const accessRedis = new Redis(env.REDIS_URL);
  const jobRepository = new DrizzleJobRepository();
  const userRepository = new DrizzleUserRepository();
  const usageRepository = new DrizzleUsageRepository();
  const planLimitResolver = new EnvPlanLimitResolver();
  const quotaService = new QuotaService({
    jobRepository,
    usageRepository,
    planLimitResolver,
  });
  const integrationRepository = new DrizzleIntegrationRepository();
  const sessionRepository = new DrizzleSessionRepository();
  const schedules = new ScheduleCoordinator(jobRepository, userRepository);
  const jobScheduler = new BullMqJobScheduler(undefined, (jobId) =>
    schedules.timezoneForJob(jobId)
  );
  const accessCooldown = new AccessCooldownService(
    new RedisAccessCooldownStore(accessRedis),
    sessionRepository
  );
  const compilerProvider = createCompilerProvider();
  const browserCapacity = new BrowserCapacity(new RedisLeaseStore(accessRedis));
  const extraction = composeExtraction(createHttpCandidates(), browserCapacity);
  const configurationPipeline = new ConfigurationPipeline(
    createConfigurationModel(compilerProvider),
    extraction.discovery,
    extraction.executor,
    {
      budgetMs: env.COMPILATION_BUDGET_MS,
      maxAttempts: env.COMPILATION_MAX_ATTEMPTS,
      maxDecisions: env.CONFIGURATION_MAX_DECISIONS,
      reviewReserveMs: env.CONFIGURATION_REVIEW_RESERVE_MS,
      evidenceLimit: env.CONFIGURATION_MAX_INPUT_CHARS,
      semanticEnabled: env.SEMANTIC_REVIEW_ENABLED,
      semanticThreshold: env.SEMANTIC_REVIEW_THRESHOLD,
    }
  );
  const scraperEngine = createScraperEngine(browserCapacity, env.SCRAPER_ENGINE);
  const storageProvider = createStorageProvider();
  const realtimeEventBus = createRealtimeEventBus();
  const realtimeService = new RealtimeService(realtimeEventBus);

  const emailNotificationProvider = createNotificationProvider();
  const telegramProvider = new TelegramNotificationProvider();
  const webhookProvider = new WebhookNotificationProvider();

  const notificationDispatcher = new NotificationDispatcher({
    emailProvider: emailNotificationProvider,
    telegramProvider,
    webhookProvider,
    integrationRepository,
    userRepository,
  });

  const compilationService = new CompilationService({
    jobRepository,
    configurationPipeline,
    alertRouter: notificationDispatcher,
    jobScheduler,
    storageProvider,
    sessionRepository,
    realtimeService,
    quotaService,
  });

  const scrapeExecutionService = new ScrapeExecutionService({
    accessCooldown,
    jobRepository,
    planExecutor: extraction.planExecutor,
    alertRouter: notificationDispatcher,
    jobScheduler,
    storageProvider,
    sessionRepository,
    realtimeService,
    quotaService,
  });

  const retentionService = new RetentionService(jobRepository);
  const jobService = new JobService(
    jobRepository,
    jobScheduler,
    scraperEngine,
    sessionRepository,
    realtimeService,
    new JobPresenter(accessCooldown),
    quotaService
  );
  const authService = new AuthService(userRepository, {
    onTimezoneChanged: (userId) => schedules.refreshUserSchedules(userId, jobScheduler),
  });
  const integrationService = new IntegrationService(
    integrationRepository,
    telegramProvider,
    webhookProvider
  );
  const sessionService = new SessionService(sessionRepository);

  // Run migrations automatically on startup
  try {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const { getDb } = await import('./db/index.js');
    await migrate(getDb(), { migrationsFolder: 'drizzle/migrations' });
    logger.info('Database migrations applied successfully.');
  } catch (err) {
    logger.error('Database migration failed', {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // Reconcile PostgreSQL active jobs with BullMQ repeatable schedules on startup
  try {
    await reconcileRepeatableJobs(jobScheduler.scrapeQueue, await schedules.activeSchedules());
    await reconcilePendingCompilations(
      jobScheduler.compilationQueue,
      (await jobRepository.findAll(JobStatus.PendingCompilation)).map((job) => job.id),
      (jobId) => jobScheduler.enqueueCompilation(jobId, CompilationReason.Initial)
    );
    await jobScheduler.scheduleDailyRetentionPruning();
  } catch (err) {
    logger.warn(
      'Startup job reconciliation skipped or failed (database/redis may still be starting)',
      {
        errorMessage: err instanceof Error ? err.message : String(err),
      }
    );
  }

  const workerManager = new WorkerManager({
    compilationService,
    scrapeExecutionService,
    retentionService,
  });
  workerManager.start();
  const outboxWorker = new OutboxWorker(
    new DrizzleOutboxRepository(),
    notificationDispatcher,
    env.NOTIFICATION_MAX_ATTEMPTS,
    env.NOTIFICATION_TIMEOUT_MS
  );
  outboxWorker.start();

  const app = await buildApp({
    jobService,
    authService,
    integrationService,
    sessionService,
    realtimeService,
    quotaService,
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    await app.close();
    await workerManager.stop();
    await outboxWorker.close();
    await jobScheduler.close();
    await accessRedis.quit();
    await realtimeService.close();
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
    void logProviderQuotasOnStartup().catch((quotaErr) => {
      logger.warn('Failed to verify unblocker provider quotas on startup', {
        errorMessage: quotaErr instanceof Error ? quotaErr.message : String(quotaErr),
      });
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
