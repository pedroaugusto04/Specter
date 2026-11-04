import { afterEach, describe, expect, it } from 'vitest';
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
  return { app, headers, userId: sessionOwner, integrations };
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
});
