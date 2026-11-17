import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QuotaService } from '../../src/services/quotaService.js';
import { QuotaExceededError } from '../../src/errors/domainErrors.js';
import type {
  IPlanLimitResolver,
  PlanLimits,
} from '../../src/services/quotas/planLimits.interface.js';
import { EnvPlanLimitResolver } from '../../src/services/quotas/envPlanLimitResolver.js';
import { SessionService } from '../../src/services/sessionService.js';
import {
  createTestCompilationService,
  createTestJobService,
  createTestRealtimeService,
  createTestScrapeExecutionService,
  InMemoryIntegrationRepository,
  InMemoryJobRepository,
  InMemorySessionRepository,
  InMemoryUsageRepository,
  InMemoryUserRepository,
  MockJobScheduler,
} from '../helpers/testDoubles.js';
import { JobStatus } from '../../src/types/enums.js';
import { CompilationReason } from '../../src/queues/scheduler.interface.js';
import { fixturePlan } from '../helpers/extractionFixtures.js';
import { buildApp } from '../../src/app.js';
import { AuthService } from '../../src/services/authService.js';
import { IntegrationService } from '../../src/services/integrationService.js';
import { TelegramNotificationProvider } from '../../src/providers/notifications/telegramNotification.provider.js';
import { WebhookNotificationProvider } from '../../src/providers/notifications/webhookNotification.provider.js';
import type { FastifyInstance } from 'fastify';

function extractCookieHeader(setCookieHeader: string | string[] | undefined): string {
  if (!setCookieHeader) return '';
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return list
    .map((cookieStr) => cookieStr.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

describe('Quota Enforcement (Trava A, Trava B, Trava D)', () => {
  let jobRepository: InMemoryJobRepository;
  let usageRepository: InMemoryUsageRepository;
  let planLimitResolver: IPlanLimitResolver;
  let quotaService: QuotaService;
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    jobRepository = new InMemoryJobRepository();
    usageRepository = new InMemoryUsageRepository();
    jobRepository.usageRepository = usageRepository;
    planLimitResolver = new EnvPlanLimitResolver({
      maxActiveMonitors: 2,
      maxMonthlyCompilations: 3,
      maxMonthlyExecutions: 5,
    });
    quotaService = new QuotaService({
      jobRepository,
      usageRepository,
      planLimitResolver,
    });
  });

  describe('Trava A: Active Monitors Quota', () => {
    it('allows creating monitors within active limit', async () => {
      const scheduler = new MockJobScheduler();
      const jobService = createTestJobService({
        jobRepository,
        jobScheduler: scheduler,
        quotaService,
      });

      await jobService.createJob({
        userId,
        name: 'Monitor 1',
        url: 'https://example.com/1',
        userPrompt: 'Extract price',
      });

      await jobService.createJob({
        userId,
        name: 'Monitor 2',
        url: 'https://example.com/2',
        userPrompt: 'Extract price',
      });

      const count = await jobRepository.countActiveJobsByUserId(userId);
      expect(count).toBe(2);
    });

    it('blocks creating more monitors when active limit is reached', async () => {
      const scheduler = new MockJobScheduler();
      const jobService = createTestJobService({
        jobRepository,
        jobScheduler: scheduler,
        quotaService,
      });

      await jobService.createJob({
        userId,
        name: 'Monitor 1',
        url: 'https://example.com/1',
        userPrompt: 'Extract price',
      });
      await jobService.createJob({
        userId,
        name: 'Monitor 2',
        url: 'https://example.com/2',
        userPrompt: 'Extract price',
      });

      await expect(
        jobService.createJob({
          userId,
          name: 'Monitor 3',
          url: 'https://example.com/3',
          userPrompt: 'Extract price',
        })
      ).rejects.toThrow(QuotaExceededError);
    });

    it('does not count paused monitors towards the active quota', async () => {
      const scheduler = new MockJobScheduler();
      const jobService = createTestJobService({
        jobRepository,
        jobScheduler: scheduler,
        quotaService,
      });

      const job1 = await jobService.createJob({
        userId,
        name: 'Monitor 1',
        url: 'https://example.com/1',
        userPrompt: 'Extract price',
      });
      await jobService.createJob({
        userId,
        name: 'Monitor 2',
        url: 'https://example.com/2',
        userPrompt: 'Extract price',
      });

      // Pause job1
      await jobService.setJobPauseState(job1.id, true, userId);

      // Now user has 1 active monitor; creating a 3rd monitor should succeed
      const job3 = await jobService.createJob({
        userId,
        name: 'Monitor 3',
        url: 'https://example.com/3',
        userPrompt: 'Extract price',
      });
      expect(job3.id).toBeDefined();

      // Trying to unpause job1 now should fail because active limit (2) is reached
      await expect(jobService.setJobPauseState(job1.id, false, userId)).rejects.toThrow(
        QuotaExceededError
      );
    });
  });

  describe('Trava B: Monthly AI Compilations Quota', () => {
    it('blocks creating a job when monthly compilation quota is exhausted', async () => {
      // Simulate 3 compilations already used
      await usageRepository.incrementCompilations(userId);
      await usageRepository.incrementCompilations(userId);
      await usageRepository.incrementCompilations(userId);

      const scheduler = new MockJobScheduler();
      const jobService = createTestJobService({
        jobRepository,
        jobScheduler: scheduler,
        quotaService,
      });

      await expect(
        jobService.createJob({
          userId,
          name: 'Monitor New',
          url: 'https://example.com/item',
          userPrompt: 'Extract title',
        })
      ).rejects.toThrow(QuotaExceededError);
    });

    it('records a compilation upon successful compilation', async () => {
      const scheduler = new MockJobScheduler();
      const plan = fixturePlan();
      const job = await jobRepository.createJob({
        userId,
        name: 'Monitor Compile',
        url: 'https://example.com',
        userPrompt: 'Extract',
        cronExpression: '0 */6 * * *',
      });

      const fakePipeline = {
        configure: async () => ({
          plan,
          run: {
            id: 'run-1',
            jobId: job.id,
            hasChanges: 'NO' as const,
            status: 'SUCCESS' as const,
            extractedData: { title: 'Item' },
            executedAt: new Date(),
          },
          summary: 'Configured',
          sample: { title: 'Item' },
          semanticReview: { status: 'OPTIMAL', score: 5 },
          execution: {
            report: {
              quality: 'COMPLETE' as const,
              issues: [],
              validatedSourceRecords: 1,
              scope: 'TARGET_MATCH',
              pagesVisited: 1,
              sourcesUsed: ['primary'],
              evidence: [],
            },
            snapshot: {
              html: '<html><body>Item</body></html>',
              url: 'https://example.com',
              httpStatus: 200,
            },
            scrape: { httpStatus: 200, executionTimeMs: 100, screenshotPath: null, evidence: [] },
            data: { title: 'Item' },
            durationMs: 100,
          },
        }),
      };

      const compilationService = createTestCompilationService({
        jobRepository,
        configurationPipeline: fakePipeline as any,
        alertRouter: { dispatch: async () => {} } as any,
        jobScheduler: scheduler,
        storageProvider: {} as any,
        quotaService,
      });

      await compilationService.compileJob(job.id, CompilationReason.Initial);

      const usage = await usageRepository.getUsage(userId);
      expect(usage.compilationsCount).toBe(1);
    });

    it('fails recovery cleanly if compilation quota is exhausted', async () => {
      // Exhaust compilation quota
      await usageRepository.incrementCompilations(userId);
      await usageRepository.incrementCompilations(userId);
      await usageRepository.incrementCompilations(userId);

      const job = await jobRepository.createJob({
        userId,
        name: 'Monitor Recovery',
        url: 'https://example.com',
        userPrompt: 'Extract',
        cronExpression: '0 */6 * * *',
      });

      const active = (await jobRepository.updateJob(job.id, {
        status: JobStatus.Active,
        extractionPlan: fixturePlan(),
      }))!;
      const run = (await jobRepository.beginRun(active, 'recovery-quota-test'))!;
      const recoveringRun = await jobRepository.commitRun(
        { ...run, phase: 'RECOVERING' },
        [],
        { status: JobStatus.Recovering },
        active.updatedAt
      );

      let configureCalled = false;
      const fakePipeline = {
        configure: async () => {
          configureCalled = true;
          throw new Error('Should not be called');
        },
      };

      const compilationService = createTestCompilationService({
        jobRepository,
        configurationPipeline: fakePipeline as any,
        alertRouter: { dispatch: async () => {} } as any,
        jobScheduler: new MockJobScheduler(),
        storageProvider: {} as any,
        quotaService,
      });

      await compilationService.compileJob(job.id, CompilationReason.Recovery, false, run.id);

      expect(configureCalled).toBe(false);
      const updated = await jobRepository.findById(job.id);
      expect(updated?.status).toBe(JobStatus.Failed);
      expect(updated?.lastError).toContain('could not be verified');
      expect((await jobRepository.findRun(recoveringRun.id))?.status).toBe('FAILED');
    });
  });

  describe('Trava D: Monthly Scrape Executions Pool', () => {
    it('records executions and allows runs until quota limit is reached', async () => {
      const plan = fixturePlan();
      const job = await jobRepository.createJob({
        userId,
        name: 'Monitor Run',
        url: 'https://example.com',
        userPrompt: 'Extract',
        cronExpression: '0 */6 * * *',
      });
      await jobRepository.updateJob(job.id, {
        status: JobStatus.Active,
        extractionPlan: plan,
      });

      let executionCount = 0;
      const fakePlanExecutor = {
        execute: async () => {
          executionCount++;
          return {
            report: {
              quality: 'COMPLETE' as const,
              issues: [],
              validatedSourceRecords: 1,
              scope: 'TARGET_MATCH',
              pagesVisited: 1,
              sourcesUsed: ['primary'],
              evidence: [],
            },
            scrape: { httpStatus: 200, executionTimeMs: 100, screenshotPath: null, evidence: [] },
            data: { title: 'Item' },
          };
        },
      };

      const scrapeService = createTestScrapeExecutionService({
        jobRepository,
        planExecutor: fakePlanExecutor as any,
        alertRouter: { dispatch: async () => {} } as any,
        jobScheduler: new MockJobScheduler(),
        storageProvider: {} as any,
        quotaService,
      });

      // Run 5 times (limit is 5)
      for (let i = 0; i < 5; i++) {
        await scrapeService.executeScrape(job.id);
      }

      expect(executionCount).toBe(5);
      const usage = await usageRepository.getUsage(userId);
      expect(usage.executionsCount).toBe(5);

      // 6th run should be skipped due to quota reached
      const result = await scrapeService.executeScrape(job.id);
      expect(result?.status).toBe('FAILED');
      expect(executionCount).toBe(5); // Not invoked!
    });
  });

  describe('Quota Summary & Strategy Extensibility', () => {
    it('returns accurate summary of limits and remaining balances', async () => {
      await jobRepository.createJob({
        userId,
        name: 'Monitor 1',
        url: 'https://example.com/1',
        userPrompt: 'Extract price',
        cronExpression: '0 */6 * * *',
      });
      await usageRepository.incrementCompilations(userId);
      await usageRepository.incrementExecutions(userId);
      await usageRepository.incrementExecutions(userId);

      const summary = await quotaService.getQuotaSummary(userId);

      expect(summary.activeMonitors).toEqual({
        used: 1,
        limit: 2,
        remaining: 1,
      });
      expect(summary.monthlyCompilations).toEqual({
        used: 1,
        limit: 3,
        remaining: 2,
      });
      expect(summary.monthlyExecutions).toEqual({
        used: 2,
        limit: 5,
        remaining: 3,
      });
    });

    it('demonstrates pluggable plan limits for future tiers', async () => {
      // Future Pro Tier resolver
      class ProTierPlanResolver implements IPlanLimitResolver {
        async getLimitsForUser(_userId: string): Promise<PlanLimits> {
          return {
            maxActiveMonitors: 50,
            maxMonthlyCompilations: 500,
            maxMonthlyExecutions: 20000,
          };
        }
      }

      const proQuotaService = new QuotaService({
        jobRepository,
        usageRepository,
        planLimitResolver: new ProTierPlanResolver(),
      });

      const summary = await proQuotaService.getQuotaSummary(userId);
      expect(summary.activeMonitors.limit).toBe(50);
      expect(summary.monthlyCompilations.limit).toBe(500);
      expect(summary.monthlyExecutions.limit).toBe(20000);
    });
  });

  describe('REST API /api/quotas endpoint', () => {
    let app: FastifyInstance;
    let authCookie: string;

    beforeEach(async () => {
      const userRepository = new InMemoryUserRepository();
      const authService = new AuthService(userRepository, {
        jwtSecret: 'test-jwt-secret-key-with-at-least-32-bytes',
        accessExpiresSeconds: 900,
        refreshExpiresSeconds: 604800,
      });

      const integrationService = new IntegrationService(
        new InMemoryIntegrationRepository(),
        new TelegramNotificationProvider(),
        new WebhookNotificationProvider()
      );

      const sessionRepository = new InMemorySessionRepository();
      const realtimeService = createTestRealtimeService();
      const sessionService = new SessionService(sessionRepository);

      const jobService = createTestJobService({
        jobRepository,
        quotaService,
        sessionRepository,
        realtimeService,
      });

      app = await buildApp({
        jobService,
        authService,
        integrationService,
        sessionService,
        realtimeService,
        quotaService,
        enableLogger: false,
      });

      const regRes = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'quota-user@example.com',
          password: 'Password123!',
          name: 'User',
        },
      });
      authCookie = extractCookieHeader(regRes.headers['set-cookie']);
    });

    afterEach(async () => {
      await app.close();
    });

    it('returns quota summary for authenticated user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/quotas',
        headers: {
          cookie: authCookie,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.data.activeMonitors).toBeDefined();
      expect(json.data.monthlyCompilations).toBeDefined();
      expect(json.data.monthlyExecutions).toBeDefined();
    });

    it('rejects unauthenticated requests to /api/quotas with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/quotas',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
