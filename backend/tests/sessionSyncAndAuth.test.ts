import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { AuthService } from '../src/services/authService.js';
import { JobService } from '../src/services/jobService.js';
import { IntegrationService } from '../src/services/integrationService.js';
import { SessionService } from '../src/services/sessionService.js';
import type {
  ISessionRepository,
  UpsertSessionInput,
} from '../src/repositories/sessionRepository.js';
import type { IUserRepository, UserEntity } from '../src/repositories/userRepository.js';
import type { IJobRepository } from '../src/repositories/jobRepository.js';
import type { IIntegrationRepository } from '../src/repositories/integrationRepository.js';
import type { IJobScheduler } from '../src/queues/scheduler.interface.js';
import type { UserWebSessionRow } from '../src/db/schema.js';

// In-Memory User Repository Mock
class InMemoryUserRepository implements IUserRepository {
  private users: Map<string, UserEntity> = new Map();

  async findById(id: string): Promise<UserEntity | null> {
    return this.users.get(id) ?? null;
  }
  async findByEmail(email: string): Promise<UserEntity | null> {
    for (const u of this.users.values()) {
      if (u.email === email) return u;
    }
    return null;
  }
  async findByGoogleId(_googleId: string): Promise<UserEntity | null> {
    return null;
  }
  async createUser(data: {
    email: string;
    name: string | null;
    passwordHash: string | null;
  }): Promise<UserEntity> {
    const user: UserEntity = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      googleId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }
  async createGoogleUser(): Promise<UserEntity> {
    throw new Error('Not implemented');
  }
  async linkGoogleAccount(): Promise<UserEntity> {
    throw new Error('Not implemented');
  }
  async updateUser(id: string, patch: { name?: string | null }): Promise<UserEntity | null> {
    const existing = this.users.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }
}

// In-Memory Session Repository Mock
class InMemorySessionRepository implements ISessionRepository {
  private sessions: Map<string, UserWebSessionRow> = new Map();

  async findByUserAndDomain(
    userId: string,
    hostOrDomain: string
  ): Promise<UserWebSessionRow | null> {
    const clean = hostOrDomain.trim().toLowerCase();
    for (const s of this.sessions.values()) {
      if (s.userId === userId && (s.domain === clean || clean.endsWith(`.${s.domain}`))) {
        return s;
      }
    }
    return null;
  }

  async listByUserId(userId: string): Promise<UserWebSessionRow[]> {
    return Array.from(this.sessions.values()).filter((s) => s.userId === userId);
  }

  async findById(id: string): Promise<UserWebSessionRow | null> {
    return this.sessions.get(id) ?? null;
  }

  async upsert(userId: string, input: UpsertSessionInput): Promise<UserWebSessionRow> {
    const domain = input.domain.trim().toLowerCase();
    for (const [id, s] of this.sessions.entries()) {
      if (s.userId === userId && s.domain === domain) {
        const updated: UserWebSessionRow = {
          ...s,
          name: input.name || s.name,
          storageState: input.storageState,
          cookieCount: input.storageState.cookies?.length ?? 0,
          updatedAt: new Date(),
        };
        this.sessions.set(id, updated);
        return updated;
      }
    }

    const row: UserWebSessionRow = {
      id: `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId,
      domain,
      name: input.name || domain,
      storageState: input.storageState,
      cookieCount: input.storageState.cookies?.length ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.set(row.id, row);
    return row;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const s = this.sessions.get(id);
    if (s && s.userId === userId) {
      this.sessions.delete(id);
      return true;
    }
    return false;
  }
}

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

    const dummyJobRepo = {} as IJobRepository;
    const dummyScheduler = {} as IJobScheduler;
    const jobService = new JobService(dummyJobRepo, dummyScheduler, undefined, sessionRepo);
    const dummyIntegrationRepo = {
      findByUserId: async () => null,
      upsert: async () => ({}) as any,
    } as unknown as IIntegrationRepository;
    const integrationService = new IntegrationService(dummyIntegrationRepo, {} as any, {} as any);

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
