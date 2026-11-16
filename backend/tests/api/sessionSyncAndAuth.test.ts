import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthService } from '../../src/services/authService.js';
import { JobService } from '../../src/services/jobService.js';
import { IntegrationService } from '../../src/services/integrationService.js';
import { SessionService } from '../../src/services/sessionService.js';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryJobRepository,
  InMemoryIntegrationRepository,
  MockJobScheduler,
} from '../helpers/testDoubles.js';

describe('Companion Browser Extension — Session Synchronization & Bearer Auth', () => {
  let app: FastifyInstance;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let authService: AuthService;
  let sessionService: SessionService;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    authService = new AuthService(userRepo, { jwtSecret: 'super-secret-jwt-key-for-tests-12345' });
    sessionService = new SessionService(sessionRepo);

    // Create user and get token
    const reg = await authService.register({
      email: 'pilot@specter.dev',
      password: 'StrongPassword123!',
      name: 'Pilot User',
    });
    token = reg.tokens.accessToken;
    userId = reg.user.id;

    const jobService = new JobService(
      {
        jobRepository: new InMemoryJobRepository(),
        jobScheduler: new MockJobScheduler(),
        compilationControl: { cancelCompilation: () => false },
        sessionRepository: sessionRepo,
      }
    );
    const integrationRepo = new InMemoryIntegrationRepository();
    const dummyTelegram = {
      name: 'dummy-telegram',
      sendAlert: async () => {},
      sendTestMessage: async () => ({ ok: true }),
    };
    const dummyWebhook = {
      name: 'dummy-webhook',
      sendAlert: async () => {},
      sendTestEvent: async () => ({ ok: true }),
    };
    const integrationService = new IntegrationService(
      integrationRepo,
      dummyTelegram,
      dummyWebhook
    );

    app = await buildApp({
      jobService,
      authService,
      integrationService,
      sessionService,
      enableLogger: false,
    });
    await app.ready();
  });

  it('allows Chrome extension origin via CORS headers', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/sessions',
      headers: {
        origin: 'chrome-extension://abcdefghijklmno1234567890',
        'access-control-request-method': 'POST',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'chrome-extension://abcdefghijklmno1234567890'
    );
  });

  it('rejects unauthenticated requests to /api/sessions/sync', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions/sync',
      payload: {
        domain: 'github.com',
        cookies: [{ name: 'user_session', value: 'secret-val' }],
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('synchronizes browser cookies via Bearer token authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions/sync',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        domain: 'https://painel.lojaxyz.com/admin',
        name: 'Painel Loja XYZ',
        cookies: [
          {
            name: 'session_id',
            value: 'xyz-token-999',
            domain: '.lojaxyz.com',
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
          },
          {
            name: 'auth_jwt',
            value: 'jwt-payload-sample',
            domain: 'painel.lojaxyz.com',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.data.domain).toBe('painel.lojaxyz.com');
    expect(json.data.cookieCount).toBe(2);
    expect(json.data.name).toBe('Painel Loja XYZ');
  });

  it('checks if a domain already has an active session via /api/sessions/check', async () => {
    // Sincroniza sessão
    await sessionService.syncSession(userId, {
      domain: 'app.slack.com',
      cookies: [{ name: 'd', value: 'slack-cookie' }],
    });

    // Check com subdomínio ou URL completa
    const checkRes = await app.inject({
      method: 'GET',
      url: '/api/sessions/check?url=https://app.slack.com/client/T123/C456',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(checkRes.statusCode).toBe(200);
    const body = checkRes.json();
    expect(body.data.hasSession).toBe(true);
    expect(body.data.session.domain).toBe('app.slack.com');
    expect(body.data.session.cookieCount).toBe(1);
  });

  it('lists and deletes sessions', async () => {
    const session = await sessionService.syncSession(userId, {
      domain: 'intranet.empresa.com.br',
      cookies: [{ name: 'SSID', value: '123' }],
    });

    // List
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.length).toBe(1);

    // Delete
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${session.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Verify deleted
    const listAfterRes = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(listAfterRes.json().data.length).toBe(0);
  });
});
