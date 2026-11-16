import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthService } from '../../src/services/authService.js';
import { JobService } from '../../src/services/jobService.js';
import { SessionService } from '../../src/services/sessionService.js';
import { IntegrationService } from '../../src/services/integrationService.js';
import type { ISessionRepository } from '../../src/repositories/sessionRepository.js';
import {
  createTestQuotaService,
  createTestRealtimeService,
  InMemoryJobRepository,
  InMemoryUserRepository,
  InMemoryIntegrationRepository,
  MockJobScheduler,
  MockScraperEngine,
} from '../helpers/testDoubles.js';

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
  const realtimeService = createTestRealtimeService();
  const quotaService = createTestQuotaService(jobs);
  app = await buildApp({
    jobService: new JobService({
      jobRepository: jobs,
      jobScheduler: new MockJobScheduler(),
      compilationControl: { cancelCompilation: () => false },
      scraperEngine: new MockScraperEngine(),
      sessionRepository: sessions,
      realtimeService,
      quotaService,
    }),
    authService: auth,
    integrationService: new IntegrationService(integrations, telegram, webhook),
    sessionService: new SessionService(sessions),
    realtimeService,
    quotaService,
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
  return { app, headers, userId: sessionOwner, integrations, jobs };
}
describe('API credential boundaries', () => {
  it('keeps credentials and session cookies out of API responses', async () => {
    const { app, headers, userId, integrations } = await setup();
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
  it('keeps monitor webhookSecret out of API responses, preserves it on update, and clears it explicitly', async () => {
    const { app, headers, jobs } = await setup();
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers,
      payload: {
        name: 'Secret Webhook Monitor',
        url: 'https://example.com/target',
        userPrompt: 'Track item prices',
        webhookUrl: 'https://custom-webhook.com/alerts',
        webhookSecret: 'my-job-hmac-secret-xyz',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().data;
    expect(created.hasWebhookSecret).toBe(true);
    expect(created).not.toHaveProperty('webhookSecret');
    expect(createRes.body).not.toContain('my-job-hmac-secret-xyz');

    const jobEntity = await jobs.findById(created.id);
    expect(jobEntity?.webhookSecret).toBe('my-job-hmac-secret-xyz');

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${created.id}`,
      headers,
      payload: {
        name: 'Renamed Monitor',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.hasWebhookSecret).toBe(true);
    expect((await jobs.findById(created.id))?.webhookSecret).toBe('my-job-hmac-secret-xyz');

    const clearRes = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${created.id}`,
      headers,
      payload: {
        webhookSecret: null,
      },
    });
    expect(clearRes.statusCode).toBe(200);
    expect(clearRes.json().data.hasWebhookSecret).toBe(false);
    expect((await jobs.findById(created.id))?.webhookSecret).toBeNull();
  });
});
