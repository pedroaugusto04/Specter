import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { isAllowedCorsOrigin } from '../../src/utils/corsHelper.js';
import { AuthService } from '../../src/services/authService.js';
import { IntegrationService } from '../../src/services/integrationService.js';
import { TelegramNotificationProvider } from '../../src/providers/notifications/telegramNotification.provider.js';
import { WebhookNotificationProvider } from '../../src/providers/notifications/webhookNotification.provider.js';
import { SessionService } from '../../src/services/sessionService.js';
import {
  createTestJobService,
  createTestQuotaService,
  createTestRealtimeService,
  InMemoryIntegrationRepository,
  InMemoryJobRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  MockJobScheduler,
  MockScraperEngine,
} from '../helpers/testDoubles.js';

function extractCookieHeader(setCookieHeader: string | string[] | undefined): string {
  if (!setCookieHeader) return '';
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return list
    .map((cookieStr) => cookieStr.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

describe('Stateless JWT Cookie Authentication & Multi-Tenant Isolation', () => {
  let app: FastifyInstance;
  let jobRepository: InMemoryJobRepository;
  let userRepository: InMemoryUserRepository;
  let scheduler: MockJobScheduler;
  let scraperEngine: MockScraperEngine;
  let authService: AuthService;

  beforeEach(async () => {
    jobRepository = new InMemoryJobRepository();
    userRepository = new InMemoryUserRepository();
    scheduler = new MockJobScheduler();
    scraperEngine = new MockScraperEngine();

    const sessionRepository = new InMemorySessionRepository();
    const realtimeService = createTestRealtimeService();
    const quotaService = createTestQuotaService(jobRepository);
    const sessionService = new SessionService(sessionRepository);

    const jobService = createTestJobService({
      jobRepository,
      jobScheduler: scheduler,
      scraperEngine,
      sessionRepository,
      realtimeService,
      quotaService,
    });
    authService = new AuthService(userRepository, {
      jwtSecret: 'test-jwt-secret-key-with-at-least-32-bytes',
      accessExpiresSeconds: 900,
      refreshExpiresSeconds: 604800,
      cookieSecure: true,
    });
    const integrationRepository = new InMemoryIntegrationRepository();
    const telegramProvider = new TelegramNotificationProvider('test-token');
    const webhookProvider = new WebhookNotificationProvider();
    const integrationService = new IntegrationService(
      integrationRepository,
      telegramProvider,
      webhookProvider
    );

    app = await buildApp({
      jobService,
      authService,
      integrationService,
      sessionService,
      realtimeService,
      quotaService,
      enableLogger: false,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('registers a user and sets HttpOnly, SameSite=Lax, Secure JWT cookies', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'Alice@Example.com',
        password: 'securePassword123',
        name: 'Alice',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toMatchObject({
      email: 'alice@example.com',
      name: 'Alice',
    });
    expect(body.data.passwordHash).toBeUndefined();

    const rawSetCookie = res.headers['set-cookie'];
    expect(Array.isArray(rawSetCookie)).toBe(true);
    const cookiesList = rawSetCookie as string[];
    expect(
      cookiesList.some(
        (c) =>
          c.startsWith('specter_access=') &&
          c.includes('HttpOnly') &&
          c.includes('SameSite=Lax') &&
          c.includes('Secure')
      )
    ).toBe(true);
    expect(
      cookiesList.some(
        (c) =>
          c.startsWith('specter_refresh=') &&
          c.includes('HttpOnly') &&
          c.includes('SameSite=Lax') &&
          c.includes('Secure')
      )
    ).toBe(true);

    const cookieHeader = extractCookieHeader(rawSetCookie);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieHeader },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.email).toBe('alice@example.com');

    const updateRes = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile',
      headers: { cookie: cookieHeader },
      payload: { name: 'Alice Smith' },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.name).toBe('Alice Smith');
  });

  it('registers a user with a specific timezone and persists it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'tzuser@example.com',
        password: 'securePassword123',
        name: 'Timezone User',
        timezone: 'America/New_York',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.timezone).toBe('America/New_York');
  });

  it('rejects duplicate email registration and invalid login credentials', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'bob@example.com',
        password: 'password1234',
      },
    });

    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'BOB@example.com',
        password: 'anotherPassword123',
      },
    });
    expect(dupRes.statusCode).toBe(400);
    expect(dupRes.json().fields.email).toContain('already exists');

    const badLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'bob@example.com',
        password: 'wrong-password',
      },
    });
    expect(badLogin.statusCode).toBe(401);
    expect(badLogin.json().message).toBe('Invalid email or password.');

    const goodLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'bob@example.com',
        password: 'password1234',
      },
    });
    expect(goodLogin.statusCode).toBe(200);
    expect(goodLogin.json().data.email).toBe('bob@example.com');
    expect(goodLogin.json()).not.toHaveProperty('token');
    expect(goodLogin.headers['set-cookie']).toBeDefined();
  });

  it('bounds anonymous probes without blocking ordinary dashboard requests', async () => {
    const fetch = vi.spyOn(scraperEngine, 'fetchHtml');
    for (let index = 0; index < env.RATE_LIMIT_PROBE_MAX; index++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/jobs/probe',
        payload: { url: 'https://example.com' },
        headers: { 'x-test-rate-limit': '1' },
      });
      expect(response.statusCode).toBe(200);
    }
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/jobs/probe',
      payload: { url: 'https://example.com' },
      headers: { 'x-test-rate-limit': '1' },
    });
    expect(rejected.statusCode).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(env.RATE_LIMIT_PROBE_MAX);
    expect(
      (await app.inject({ method: 'GET', url: '/api/jobs', headers: { 'x-test-rate-limit': '1' } }))
        .statusCode
    ).toBe(200);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'probe@example.com', password: 'test-password' },
    });
    const authenticated = await app.inject({
      method: 'POST',
      url: '/api/jobs/probe',
      payload: { url: 'https://example.com' },
      headers: {
        'x-test-rate-limit': '1',
        cookie: extractCookieHeader(registration.headers['set-cookie']),
      },
    });
    expect(authenticated.statusCode).toBe(200);
  });

  it('allows unauthenticated visitors to view empty dashboard and probe URLs, but blocks monitor creation until signed in', async () => {
    const jobsRes = await app.inject({
      method: 'GET',
      url: '/api/jobs',
    });
    expect(jobsRes.statusCode).toBe(200);
    expect(jobsRes.json().data.items).toEqual([]);
    expect(jobsRes.json().data.pagination.totalItems).toBe(0);

    const statsRes = await app.inject({
      method: 'GET',
      url: '/api/stats',
    });
    expect(statsRes.statusCode).toBe(200);
    expect(statsRes.json().data.totalJobs).toBe(0);

    const probeRes = await app.inject({
      method: 'POST',
      url: '/api/jobs/probe',
      payload: { url: 'https://example.com/pricing' },
    });
    expect(probeRes.statusCode).toBe(200);
    expect(probeRes.json().data.accessible).toBe(true);

    const createUnauthRes = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        url: 'https://example.com/pricing',
        userPrompt: 'Extract plan names and prices',
        notificationEmail: 'visitor@example.com',
      },
    });
    expect(createUnauthRes.statusCode).toBe(401);
  });

  it('enforces strict multi-tenant isolation between users', async () => {
    const userARes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'usera@example.com', password: 'password123' },
    });
    const cookieA = extractCookieHeader(userARes.headers['set-cookie']);

    const userBRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'userb@example.com', password: 'password123' },
    });
    const cookieB = extractCookieHeader(userBRes.headers['set-cookie']);

    // User A creates a monitor
    const createJobARes = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { cookie: cookieA },
      payload: {
        url: 'https://a.example.com',
        userPrompt: 'Extract User A data',
        notificationEmail: 'usera@example.com',
      },
    });
    expect(createJobARes.statusCode).toBe(201);
    const jobAId = createJobARes.json().data.id as string;

    // User B lists jobs -> should NOT see User A's job
    const listBRes = await app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { cookie: cookieB },
    });
    expect(listBRes.statusCode).toBe(200);
    expect(listBRes.json().data.items).toHaveLength(0);

    // User B tries to modify or delete User A's job -> 404 Not Found
    const patchByB = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${jobAId}`,
      headers: { cookie: cookieB },
      payload: { userPrompt: 'Hijacked prompt' },
    });
    expect(patchByB.statusCode).toBe(404);

    const deleteByB = await app.inject({
      method: 'DELETE',
      url: `/api/jobs/${jobAId}`,
      headers: { cookie: cookieB },
    });
    expect(deleteByB.statusCode).toBe(404);

    // User A can still see and delete their own job
    const listARes = await app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { cookie: cookieA },
    });
    expect(listARes.json().data.items).toHaveLength(1);

    const deleteByA = await app.inject({
      method: 'DELETE',
      url: `/api/jobs/${jobAId}`,
      headers: { cookie: cookieA },
    });
    expect(deleteByA.statusCode).toBe(204);
  });

  it('clears session cookies on logout', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'logout@example.com', password: 'password123' },
    });
    expect(loginRes.statusCode).toBe(201);

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });
    expect(logoutRes.statusCode).toBe(204);
    const clearedCookies = logoutRes.headers['set-cookie'] as string[];
    expect(
      clearedCookies.some((c) => c.startsWith('specter_access=;') && c.includes('Max-Age=0'))
    ).toBe(true);
    expect(
      clearedCookies.some((c) => c.startsWith('specter_refresh=;') && c.includes('Max-Age=0'))
    ).toBe(true);
  });

  it('updates user profile timezone and defaults to America/Sao_Paulo', async () => {
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'tz@example.com', password: 'password123' },
    });
    expect(regRes.statusCode).toBe(201);
    const regBody = regRes.json();
    expect(regBody.data.timezone).toBe('America/Sao_Paulo');

    const cookie = regRes.headers['set-cookie'] as string[];

    // Update timezone to America/New_York
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile',
      headers: { cookie },
      payload: { timezone: 'America/New_York' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().data.timezone).toBe('America/New_York');

    // Reject invalid timezone
    const invalidRes = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile',
      headers: { cookie },
      payload: { timezone: 'Invalid/NonExistent_Zone' },
    });
    expect(invalidRes.statusCode).toBe(400);
  });

  it('stores the browser language and lets the user select or clear an override', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'language@example.com', password: 'password123' },
    });
    expect(registered.statusCode).toBe(201);
    expect(registered.json().data).toMatchObject({
      pageLanguage: null,
      browserPageLanguage: null,
    });
    const headers = { cookie: registered.headers['set-cookie'] as string[] };
    const update = (payload: { pageLanguage?: string | null; browserPageLanguage?: string }) =>
      app.inject({ method: 'PATCH', url: '/api/auth/profile', headers, payload });

    const detected = await update({ browserPageLanguage: 'en-gb' });
    expect(detected.json().data).toMatchObject({
      pageLanguage: null,
      browserPageLanguage: 'en-GB',
    });

    expect((await update({ pageLanguage: 'zh-hant-tw' })).statusCode).toBe(200);
    expect((await update({ pageLanguage: 'en_US' })).statusCode).toBe(400);
    const profile = await app.inject({ method: 'GET', url: '/api/auth/me', headers });
    expect(profile.json().data).toMatchObject({
      pageLanguage: 'zh-Hant-TW',
      browserPageLanguage: 'en-GB',
    });

    const automatic = await update({ pageLanguage: null });
    expect(automatic.json().data).toMatchObject({
      pageLanguage: null,
      browserPageLanguage: 'en-GB',
    });
  });

  it('rejects access tokens in URL query string (disallows ?token=... for security)', async () => {
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'querytoken@example.com', password: 'password123' },
    });
    expect(regRes.statusCode).toBe(201);

    // Create an explicit token
    const token = 'valid-looking-token';

    // Attempt to access profile via query string token
    const profileRes = await app.inject({
      method: 'PATCH',
      url: `/api/auth/profile?token=${token}`,
      payload: { name: 'Hacker' },
    });
    expect(profileRes.statusCode).toBe(401);
  });

  it('enforces rate limiting on authentication routes when triggered', async () => {
    // Send requests with test header enabled up to limit
    for (let i = 0; i < 10; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-test-rate-limit': '1' },
        payload: { email: 'brute@example.com', password: 'wrong' },
      });
    }

    // 11th request should be blocked with 429 Too Many Requests
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-test-rate-limit': '1' },
      payload: { email: 'brute@example.com', password: 'wrong' },
    });
    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.json().error).toBe('TOO_MANY_REQUESTS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CORS – Chrome Extension Origin Restriction
// ─────────────────────────────────────────────────────────────────────────────
describe('CORS – Chrome Extension Origin Restriction', () => {
  const ALLOWED_EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';
  const OTHER_EXT_ID = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';

  let appDev: FastifyInstance;
  let appProd: FastifyInstance;

  beforeEach(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { AuthService } = await import('../../src/services/authService.js');
    const { IntegrationService } = await import('../../src/services/integrationService.js');
    const { TelegramNotificationProvider } =
      await import('../../src/providers/notifications/telegramNotification.provider.js');
    const { WebhookNotificationProvider } =
      await import('../../src/providers/notifications/webhookNotification.provider.js');
    const { SessionService } = await import('../../src/services/sessionService.js');
    const {
      createTestJobService,
      createTestQuotaService,
      createTestRealtimeService,
      InMemoryIntegrationRepository,
      InMemoryJobRepository,
      InMemorySessionRepository,
      InMemoryUserRepository,
      MockJobScheduler,
      MockScraperEngine,
    } = await import('../helpers/testDoubles.js');

    function makeServices() {
      const jobRepository = new InMemoryJobRepository();
      const userRepository = new InMemoryUserRepository();
      const scheduler = new MockJobScheduler();
      const scraperEngine = new MockScraperEngine();
      const sessionRepository = new InMemorySessionRepository();
      const realtimeService = createTestRealtimeService();
      const quotaService = createTestQuotaService(jobRepository);
      const sessionService = new SessionService(sessionRepository);

      const jobService = createTestJobService({
        jobRepository,
        jobScheduler: scheduler,
        scraperEngine,
        sessionRepository,
        realtimeService,
        quotaService,
      });
      const authService = new AuthService(userRepository, {
        jwtSecret: 'test-jwt-secret-key-with-at-least-32-bytes',
        accessExpiresSeconds: 900,
        refreshExpiresSeconds: 604800,
        cookieSecure: false,
      });
      const integrationRepository = new InMemoryIntegrationRepository();
      const telegramProvider = new TelegramNotificationProvider('test-token');
      const webhookProvider = new WebhookNotificationProvider();
      const integrationService = new IntegrationService(
        integrationRepository,
        telegramProvider,
        webhookProvider
      );
      return {
        jobService,
        authService,
        integrationService,
        sessionService,
        realtimeService,
        quotaService,
      };
    }

    // Development build (NODE_ENV=test, CHROME_EXTENSION_ID unset) → all extensions allowed
    appDev = await buildApp({ ...makeServices(), enableLogger: false });

    // Production build: mock env to simulate NODE_ENV=production + CHROME_EXTENSION_ID set
    vi.doMock('../../src/config/env.js', () => ({
      env: {
        NODE_ENV: 'production',
        CHROME_EXTENSION_ID: ALLOWED_EXT_ID,
        CORS_ORIGIN: 'https://app.specter.com',
        RATE_LIMIT_GLOBAL_MAX: 120,
        RATE_LIMIT_AUTH_MAX: 10,
        JWT_ACCESS_EXPIRES_SECONDS: 900,
        JWT_REFRESH_EXPIRES_SECONDS: 604800,
      },
    }));

    appProd = await buildApp({ ...makeServices(), enableLogger: false });
    vi.doUnmock('../../src/config/env.js');
  });

  afterEach(async () => {
    await appDev?.close();
    await appProd?.close();
    vi.restoreAllMocks();
  });

  it('development: allows any chrome-extension:// origin (CHROME_EXTENSION_ID not set)', async () => {
    const res = await appDev.inject({
      method: 'OPTIONS',
      url: '/api/auth/me',
      headers: {
        origin: `chrome-extension://${OTHER_EXT_ID}`,
        'access-control-request-method': 'GET',
      },
    });
    // Fastify @fastify/cors sends 204 for OPTIONS preflight when origin is allowed
    expect([200, 204]).toContain(res.statusCode);
    expect(res.headers['access-control-allow-origin']).toBe(`chrome-extension://${OTHER_EXT_ID}`);
  });

  it('development: allows the designated extension origin', async () => {
    const res = await appDev.inject({
      method: 'OPTIONS',
      url: '/api/auth/me',
      headers: {
        origin: `chrome-extension://${ALLOWED_EXT_ID}`,
        'access-control-request-method': 'GET',
      },
    });
    expect([200, 204]).toContain(res.statusCode);
    expect(res.headers['access-control-allow-origin']).toBe(`chrome-extension://${ALLOWED_EXT_ID}`);
  });

  it('production: permits only an explicitly configured HTTPS web origin', async () => {
    const policy = {
      nodeEnv: 'production',
      corsOrigins: 'http://old.specter.com,https://app.specter.com,*',
    };
    expect(isAllowedCorsOrigin('https://app.specter.com', policy)).toBe(true);
    expect(isAllowedCorsOrigin('http://old.specter.com', policy)).toBe(false);
    expect(isAllowedCorsOrigin('https://attacker.example', policy)).toBe(false);
    expect(isAllowedCorsOrigin('*', policy)).toBe(false);
    expect(
      isAllowedCorsOrigin('http://localhost:3000', {
        nodeEnv: 'development',
        corsOrigins: 'https://app.specter.com',
      })
    ).toBe(true);
    expect(
      isAllowedCorsOrigin('chrome-extension://extid', {
        nodeEnv: 'development',
        corsOrigins: 'https://app.specter.com',
      })
    ).toBe(true);
  });
});
