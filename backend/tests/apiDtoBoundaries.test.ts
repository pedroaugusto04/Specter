import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { AuthService } from '../src/services/authService.js';
import { JobService } from '../src/services/jobService.js';
import { SessionService } from '../src/services/sessionService.js';
import { IntegrationService } from '../src/services/integrationService.js';
import type { ISessionRepository } from '../src/repositories/sessionRepository.js';
import {
  InMemoryJobRepository,
  InMemoryUserRepository,
  InMemoryIntegrationRepository,
  MockJobScheduler,
  MockScraperEngine,
} from './helpers/testDoubles.js';
import { fixturePlan } from './helpers/extractionFixtures.js';
import { JobPresenter } from '../src/presentation/jobPresenter.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
});
async function setup() {
  const users = new InMemoryUserRepository();
  const jobs = new InMemoryJobRepository();
  const integrations = new InMemoryIntegrationRepository();
  const auth = new AuthService(users);
  const sessions: ISessionRepository = {
    findByUserAndDomain: async () => null,
    findById: async () => null,
    listByUserId: async (userId) => [
      {
        id: 'session',
        userId,
        domain: 'example.com',
        name: 'Saved session',
        cookieCount: 1,
        storageState: {
          cookies: [
            {
              name: 'secret-cookie',
              value: 'private-cookie-value',
              domain: 'example.com',
              path: '/',
              expires: -1,
              secure: true,
              httpOnly: true,
              sameSite: 'Lax',
            },
          ],
          origins: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    upsert: async () => {
      throw new Error('Not exercised');
    },
    delete: async () => true,
  };
  const webhook = {
    name: 'test',
    sendAlert: async () => {},
    sendTestEvent: async () => ({ ok: true }),
  };
  const telegram = {
    name: 'test',
    sendAlert: async () => {},
    sendTestMessage: async () => ({ ok: true }),
    getBotUsername: async () => 'test_bot',
  };
  app = await buildApp({
    jobService: new JobService(jobs, new MockJobScheduler(), new MockScraperEngine()),
    authService: auth,
    integrationService: new IntegrationService(integrations, telegram, webhook),
    sessionService: new SessionService(sessions),
    enableLogger: false,
  });
  const registration = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'dto@example.com', password: 'test-password-123', name: 'DTO owner' },
  });
  const cookies = registration.headers['set-cookie'];
  const cookie = (Array.isArray(cookies) ? cookies : [cookies!])
    .map((value) => value.split(';')[0])
    .join('; ');
  const sessionOwner = registration.json().data.id;
  const headers = { cookie };
  return { app, headers, userId: sessionOwner, jobs, integrations, users };
}
describe('HTTP DTO boundaries', () => {
  it('returns only public user, session and integration attributes', async () => {
    const { app, headers, userId, integrations, users } = await setup();
    Object.assign(users.users.get(userId)!, { internalOnly: 'do-not-expose' });
    const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers })).json().data;
    expect(Object.keys(me).sort()).toEqual(['id', 'email', 'name', 'timezone', 'createdAt'].sort());
    await integrations.upsert(userId, {
      telegramBotToken: 'private-bot-token',
      webhookSecret: 'private-signing-secret',
      webhookEnabled: true,
      webhookUrl: 'https://example.com',
    });
    const integration = (
      await app.inject({ method: 'GET', url: '/api/integrations', headers })
    ).json().data;
    expect(integration.hasWebhookSecret).toBe(true);
    expect(integration).not.toHaveProperty('webhookSecret');
    expect(integration).not.toHaveProperty('telegramBotToken');
    const response = await app.inject({ method: 'GET', url: '/api/sessions', headers });
    expect(response.body).not.toContain('private-cookie-value');
    expect(Object.keys(response.json().data[0]).sort()).toEqual(
      ['id', 'domain', 'name', 'cookieCount', 'createdAt', 'updatedAt'].sort()
    );
    expect(JSON.stringify(me)).not.toContain('do-not-expose');
  });
  it('preserves signing secrets on unrelated updates and clears them only explicitly', async () => {
    const { app, headers, userId, integrations } = await setup();
    await integrations.upsert(userId, {
      webhookSecret: 'private-signing-secret',
      webhookEnabled: true,
      webhookUrl: 'https://example.com',
    });
    const update = await app.inject({
      method: 'PUT',
      url: '/api/integrations',
      headers,
      payload: { telegramEnabled: false, webhookEnabled: true, webhookUrl: 'https://example.com' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.body).not.toContain('private-signing-secret');
    expect((await integrations.findByUserId(userId))?.webhookSecret).toBe('private-signing-secret');
    const clear = await app.inject({
      method: 'PUT',
      url: '/api/integrations',
      headers,
      payload: { telegramEnabled: false, webhookEnabled: true, webhookSecret: null },
    });
    expect(clear.json().data.hasWebhookSecret).toBe(false);
  });
  it('uses the same monitor projection on create, list, read, update, pause and recompile', async () => {
    const { app, headers, jobs } = await setup();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/jobs',
        headers,
        payload: {
          url: 'https://example.com',
          userPrompt: 'Monitor page title',
          cronExpression: '0 */6 * * *',
        },
      })
    ).json().data;
    const id = created.id;
    Object.assign(jobs.jobs.get(id)!, {
      internalOnly: 'private',
      bullmqRepeatableKey: 'private-queue-key',
    });
    await jobs.updateJob(id, { extractionPlan: fixturePlan(), status: 'ACTIVE' });
    for (const request of [
      { method: 'GET' as const, url: `/api/jobs/${id}` },
      {
        method: 'PATCH' as const,
        url: `/api/jobs/${id}`,
        payload: { notificationEmail: 'next@example.com' },
      },
      { method: 'PATCH' as const, url: `/api/jobs/${id}/pause`, payload: { paused: true } },
      { method: 'POST' as const, url: `/api/jobs/${id}/recompile` },
    ]) {
      const response = await app.inject({ ...request, headers });
      expect(response.statusCode).toBe(200);
      const dto = response.json().data;
      expect(dto).toHaveProperty('accessState', null);
      expect(dto).not.toHaveProperty('effectiveSemanticPolicy');
      expect(dto).not.toHaveProperty('bullmqRepeatableKey');
      expect(dto).not.toHaveProperty('internalOnly');
      expect(dto).not.toHaveProperty('userId');
      expect(dto).not.toHaveProperty('healingAttempts');
      expect(dto).not.toHaveProperty('contractRevision');
      expect(dto).not.toHaveProperty('planRevision');
    }
    const listed = (await app.inject({ method: 'GET', url: '/api/jobs', headers })).json().data;
    expect(listed[0]).not.toHaveProperty('internalOnly');
    expect(created).toHaveProperty('accessState', null);
    const report = Object.assign(
      {
        quality: 'COMPLETE' as const,
        scope: 'page' as const,
        pagesVisited: 1,
        issues: [],
        sourcesUsed: {},
      },
      { internalDiagnostic: 'private-diagnostic' }
    );
    await jobs.createRun({
      jobId: id,
      extractedData: { title: 'Requested title' },
      extractionReport: report,
      hasChanges: 'INITIAL',
      status: 'SUCCESS',
    });
    Object.assign(jobs.runs[0]!, { privateRun: 'private-run' });
    const history = await app.inject({ method: 'GET', url: `/api/jobs/${id}/runs`, headers });
    expect(history.body).not.toContain('private-diagnostic');
    expect(history.body).not.toContain('private-run');
    expect(history.json().data.runs[0].extractedData).toEqual({ title: 'Requested title' });
    expect(history.json().data.runs[0]).not.toHaveProperty('normalizedHash');
    const stats = Object.assign(await jobs.getStats(), { internalOnly: 'private-stat' });
    vi.spyOn(jobs, 'getStats').mockResolvedValueOnce(stats);
    const dashboard = await app.inject({ method: 'GET', url: '/api/stats', headers });
    expect(dashboard.body).not.toContain('private-stat');
    expect((await new JobPresenter().present(jobs.jobs.get(id)!))).not.toHaveProperty(
      'effectiveSemanticPolicy'
    );
  });
});
