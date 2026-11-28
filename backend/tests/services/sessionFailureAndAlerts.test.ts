import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestScrapeExecutionService,
  InMemoryJobRepository,
  InMemorySessionRepository,
  InMemoryUsageRepository,
  MockJobScheduler,
  MockNotificationProvider,
  MockScraperEngine,
} from '../helpers/testDoubles.js';
import { fixtureExecutor, fixturePlan } from '../helpers/extractionFixtures.js';
import { NoopStorageProvider } from '../../src/providers/storage/noopStorage.provider.js';
import { FailureCode, USER_FAILURES } from '@specter/contracts';
import type { PlaywrightStorageState } from '../../src/types/session.js';

describe('Deterministic session expiration and failure alerts', () => {
  let repo: InMemoryJobRepository;
  let scheduler: MockJobScheduler;
  let scraper: MockScraperEngine;
  let notificationProvider: MockNotificationProvider;
  let sessionRepo: InMemorySessionRepository;
  let execute: ReturnType<typeof createTestScrapeExecutionService>;
  let jobId: string;
  const targetUrl = 'https://app.feconnect.com.br/home';

  beforeEach(async () => {
    repo = new InMemoryJobRepository();
    repo.usageRepository = new InMemoryUsageRepository();
    scheduler = new MockJobScheduler();
    scraper = new MockScraperEngine();
    notificationProvider = new MockNotificationProvider();
    sessionRepo = new InMemorySessionRepository();

    const shared = {
      jobRepository: repo,
      jobScheduler: scheduler,
      alertRouter: notificationProvider,
      storageProvider: new NoopStorageProvider(),
      sessionRepository: sessionRepo,
    };

    execute = createTestScrapeExecutionService({
      ...shared,
      planExecutor: fixtureExecutor(scraper),
    });

    const job = await repo.createJob({
      url: targetUrl,
      userPrompt: 'Track MRR and active clients',
      cronExpression: '0 */6 * * *',
      notificationEmail: 'user@feconnect.com.br',
    });
    jobId = job.id;
    await repo.updateJob(jobId, { status: 'ACTIVE', extractionPlan: fixturePlan() });
  });

  it('detects pre-navigation expired cookies deterministically and dispatches failure alert', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredStorageState: PlaywrightStorageState = {
      cookies: [
        {
          name: 'session_token',
          value: 'expired_val',
          domain: 'app.feconnect.com.br',
          path: '/',
          expires: nowSec - 3600, // 1 hour ago
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    };

    const user = (await repo.findById(jobId))!;
    await sessionRepo.upsert(user.userId, {
      domain: 'app.feconnect.com.br',
      name: 'app.feconnect.com.br',
      storageState: expiredStorageState,
    });

    // Execute scrape
    const run = await execute.executeScrape(jobId);
    expect(run).toBeDefined();
    expect(run?.status).toBe('FAILED');
    expect(run?.extractionReport?.failureCode).toBe(FailureCode.SessionExpired);
    expect(run?.errorMessage).toBe(USER_FAILURES.sessionUnavailable.description);

    // Verify terminal failure alert was prepared
    expect(repo.pendingDeliveries.length).toBeGreaterThan(0);
    const delivery = repo.pendingDeliveries[0]!;
    expect(delivery.payload.subject).toContain('Attention required');
    if (delivery.payload.kind === 'failure') {
      expect(delivery.payload.errorTitle).toBe(USER_FAILURES.sessionUnavailable.title);
      expect(delivery.payload.requiresSessionRenewal).toBe(true);
    }

    // Verify lastFailureAlertAt was recorded on the job
    const updatedJob = await repo.findById(jobId);
    expect(updatedJob?.lastFailureAlertAt).toBeInstanceOf(Date);
  });

  it('enforces 24h cooldown and does not spam failure alerts on recurring failures', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredStorageState: PlaywrightStorageState = {
      cookies: [
        {
          name: 'session_token',
          value: 'expired_val',
          domain: 'app.feconnect.com.br',
          path: '/',
          expires: nowSec - 3600,
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    };

    const user = (await repo.findById(jobId))!;
    await sessionRepo.upsert(user.userId, {
      domain: 'app.feconnect.com.br',
      name: 'app.feconnect.com.br',
      storageState: expiredStorageState,
    });

    // First failure
    await execute.executeScrape(jobId, 'run-1');
    const firstDeliveryCount = repo.pendingDeliveries.length;
    expect(firstDeliveryCount).toBeGreaterThan(0);

    // Second failure shortly after (within cooldown)
    await execute.executeScrape(jobId, 'run-2');
    expect(repo.pendingDeliveries.length).toBe(firstDeliveryCount); // No new deliveries!
  });

  it('detects auth rejection status codes post-navigation and flags session expiration', async () => {
    // Valid cookie format initially so it passes pre-flight
    const nowSec = Math.floor(Date.now() / 1000);
    const storageState: PlaywrightStorageState = {
      cookies: [
        {
          name: 'session_token',
          value: 'valid_val',
          domain: 'app.feconnect.com.br',
          path: '/',
          expires: nowSec + 3600,
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    };

    const user = (await repo.findById(jobId))!;
    await sessionRepo.upsert(user.userId, {
      domain: 'app.feconnect.com.br',
      name: 'app.feconnect.com.br',
      storageState,
    });

    // Scraper returns a 401 Unauthorized status and a failed extraction
    scraper.setHandler(async () => ({
      url: targetUrl,
      httpStatus: 401,
      durationMs: 10,
      rawHtml: '<html><body>401 Unauthorized</body></html>',
    }));

    const run = await execute.executeScrape(jobId);
    expect(run?.status).toBe('FAILED');
    expect(run?.extractionReport?.failureCode).toBe(FailureCode.SessionExpired);
    expect(run?.errorMessage).toBe(USER_FAILURES.sessionUnavailable.description);
  });

  it('resets lastFailureAlertAt when a subsequent run succeeds', async () => {
    await repo.updateJob(jobId, { lastFailureAlertAt: new Date(Date.now() - 1000 * 60) });

    scraper.setHandler(async (url) => ({
      url,
      httpStatus: 200,
      durationMs: 10,
      rawHtml: '<body><h1>Title</h1></body>',
    }));

    const run = await execute.executeScrape(jobId);
    expect(run?.status).toBe('SUCCESS');

    const updatedJob = await repo.findById(jobId);
    expect(updatedJob?.lastFailureAlertAt).toBeNull();
  });
});
