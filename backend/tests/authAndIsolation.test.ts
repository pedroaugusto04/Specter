import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { AuthService } from '../src/services/authService.js';
import { JobService } from '../src/services/jobService.js';
import {
  InMemoryJobRepository,
  InMemoryUserRepository,
  MockJobScheduler,
  MockScraperEngine,
} from './helpers/testDoubles.js';

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

    const jobService = new JobService(jobRepository, scheduler, scraperEngine);
    authService = new AuthService(userRepository, {
      jwtSecret: 'test-jwt-secret-key-with-at-least-32-bytes',
      accessExpiresSeconds: 900,
      refreshExpiresSeconds: 604800,
      cookieSecure: true,
    });

    app = await buildApp({ jobService, authService, enableLogger: false });
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
    expect(cookiesList.some((c) => c.startsWith('specter_access=') && c.includes('HttpOnly') && c.includes('SameSite=Lax') && c.includes('Secure'))).toBe(true);
    expect(cookiesList.some((c) => c.startsWith('specter_refresh=') && c.includes('HttpOnly') && c.includes('SameSite=Lax') && c.includes('Secure'))).toBe(true);

    const cookieHeader = extractCookieHeader(rawSetCookie);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieHeader },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.email).toBe('alice@example.com');
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
  });

  it('allows unauthenticated visitors to view empty dashboard and probe URLs, but blocks monitor creation until signed in', async () => {
    const jobsRes = await app.inject({
      method: 'GET',
      url: '/api/jobs',
    });
    expect(jobsRes.statusCode).toBe(200);
    expect(jobsRes.json().data).toEqual([]);

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
    expect(listBRes.json().data).toHaveLength(0);

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
    expect(listARes.json().data).toHaveLength(1);

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
    expect(clearedCookies.some((c) => c.startsWith('specter_access=;') && c.includes('Max-Age=0'))).toBe(true);
    expect(clearedCookies.some((c) => c.startsWith('specter_refresh=;') && c.includes('Max-Age=0'))).toBe(true);
  });
});
