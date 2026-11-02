import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors/domainErrors.js';
import type { UserDto } from '../mappers/userMapper.js';
import type { AuthService } from '../services/authService.js';
import {
  ACCESS_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  parseCookies,
  REFRESH_COOKIE_NAME,
  serializeCookie,
} from '../utils/cookies.js';
import { authLoginSchema, authRegisterSchema } from './schemas.js';

function resolveDynamicCallbackUrl(request: FastifyRequest): string {
  const proto =
    (request.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
    request.protocol ||
    'http';
  const host =
    (request.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
    request.headers.host ||
    'localhost:3001';
  return `${proto}://${host}/api/auth/google/callback`;
}

export async function resolveAuthenticatedUser(
  request: FastifyRequest,
  reply: FastifyReply,
  authService: AuthService,
  requireAuth = false
): Promise<UserDto | null> {
  const cookies = parseCookies(request.headers.cookie);
  const session = await authService.resolveSession(
    cookies[ACCESS_COOKIE_NAME],
    cookies[REFRESH_COOKIE_NAME]
  );

  if (session?.refreshedTokens) {
    reply.header('Set-Cookie', authService.buildAuthCookies(session.refreshedTokens));
  }

  if (!session?.user && requireAuth) {
    throw new UnauthorizedError('Please sign in to continue.');
  }

  return session?.user ?? null;
}

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService): void {
  app.get('/api/auth/me', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, false);
    return {
      data: user,
      meta: {
        googleEnabled: authService.isGoogleConfigured(),
      },
    };
  });

  app.patch('/api/auth/profile', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const body = (request.body as { name?: string | null }) ?? {};
    const updated = await authService.updateProfile(user!.id, {
      name: typeof body.name === 'string' ? body.name : body.name === null ? null : undefined,
    });
    return reply.status(200).send({ data: updated });
  });

  app.post('/api/auth/register', async (request, reply) => {
    const input = authRegisterSchema.parse(request.body);
    const { user, tokens } = await authService.register(input);
    reply.header('Set-Cookie', authService.buildAuthCookies(tokens));
    return reply.status(201).send({ data: user });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const input = authLoginSchema.parse(request.body);
    const { user, tokens } = await authService.login(input);
    reply.header('Set-Cookie', authService.buildAuthCookies(tokens));
    return reply.status(200).send({ data: user });
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie);
    const refreshToken = cookies[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      throw new UnauthorizedError('No refresh token provided.');
    }

    const { user, tokens } = await authService.refresh(refreshToken);
    reply.header('Set-Cookie', authService.buildAuthCookies(tokens));
    return reply.status(200).send({ data: user });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.header('Set-Cookie', authService.buildClearAuthCookies());
    return reply.status(204).send();
  });

  app.get('/api/auth/google', async (request, reply) => {
    if (!authService.isGoogleConfigured()) {
      const target = `${authService.frontendUrl.replace(/\/$/, '')}/?auth_error=google_not_configured`;
      return reply.redirect(target);
    }

    const fallbackCallback = resolveDynamicCallbackUrl(request);
    const { authUrl, stateToken } = authService.createGoogleAuthorizationUrl(fallbackCallback);
    reply.header('Set-Cookie', authService.buildOAuthStateCookie(stateToken));
    return reply.redirect(authUrl);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/google/callback',
    async (request, reply) => {
      const frontendBase = authService.frontendUrl.replace(/\/$/, '');
      const { code, state, error } = request.query;

      if (error || !code || !state) {
        return reply.redirect(`${frontendBase}/?auth_error=google_cancelled`);
      }

      try {
        const cookies = parseCookies(request.headers.cookie);
        const expectedStateCookie = cookies[OAUTH_STATE_COOKIE_NAME];
        const fallbackCallback = resolveDynamicCallbackUrl(request);

        const { tokens } = await authService.authenticateGoogleCallback({
          code,
          state,
          expectedStateCookie,
          resolvedCallbackUrl: fallbackCallback,
        });

        const clearStateCookie = serializeCookie(OAUTH_STATE_COOKIE_NAME, '', {
          httpOnly: true,
          sameSite: 'Lax',
          path: '/',
          maxAge: 0,
        });

        reply.header('Set-Cookie', [...authService.buildAuthCookies(tokens), clearStateCookie]);
        return reply.redirect(`${frontendBase}/`);
      } catch {
        return reply.redirect(`${frontendBase}/?auth_error=google_failed`);
      }
    }
  );
}
