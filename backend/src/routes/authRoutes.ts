import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../errors/domainErrors.js';
import {
  optionalAuth,
  requireAuth,
  requireUser,
  resolveAuthenticatedUser,
} from '../middlewares/authMiddleware.js';
import type { AuthService } from '../services/authService.js';
import {
  OAUTH_STATE_COOKIE_NAME,
  parseCookies,
  REFRESH_COOKIE_NAME,
  serializeCookie,
} from '../utils/cookies.js';
import { authLoginSchema, authProfileUpdateSchema, authRegisterSchema } from './schemas.js';

export { resolveAuthenticatedUser };

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

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService): void {
  const withAuth = requireAuth(authService);
  const withOptionalAuth = optionalAuth(authService);

  app.get('/api/auth/me', { preHandler: [withOptionalAuth] }, async (request) => {
    return {
      data: request.user,
      meta: {
        googleEnabled: authService.isGoogleConfigured(),
      },
    };
  });

  app.patch('/api/auth/profile', { preHandler: [withAuth] }, async (request, reply) => {
    const user = requireUser(request);
    const body = authProfileUpdateSchema.parse(request.body);
    const updated = await authService.updateProfile(user.id, {
      name: body.name !== undefined ? body.name : undefined,
      timezone: body.timezone,
    });
    return reply.status(200).send({ data: updated });
  });

  app.post(
    '/api/auth/register',
    {
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_AUTH_MAX,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const input = authRegisterSchema.parse(request.body);
      const { user, tokens } = await authService.register(input);
      reply.header('Set-Cookie', authService.buildAuthCookies(tokens));
      return reply.status(201).send({ data: user });
    }
  );

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_AUTH_MAX,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const input = authLoginSchema.parse(request.body);
      const { user, tokens } = await authService.login(input);
      reply.header('Set-Cookie', authService.buildAuthCookies(tokens));
      return reply.status(200).send({ data: user, token: tokens.accessToken });
    }
  );

  app.post(
    '/api/auth/refresh',
    {
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_AUTH_MAX * 2,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const cookies = parseCookies(request.headers.cookie);
      const refreshToken = cookies[REFRESH_COOKIE_NAME];
      if (!refreshToken) {
        throw new UnauthorizedError('No refresh token provided.');
      }

      const { user, tokens } = await authService.refresh(refreshToken);
      reply.header('Set-Cookie', authService.buildAuthCookies(tokens));
      return reply.status(200).send({ data: user });
    }
  );

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.header('Set-Cookie', authService.buildClearAuthCookies());
    return reply.status(204).send();
  });

  app.get<{ Querystring: { source?: string } }>('/api/auth/google', async (request, reply) => {
    const isExtension = request.query.source === 'extension';

    if (!authService.isGoogleConfigured()) {
      if (isExtension) {
        return reply.type('text/html').send(`
          <!doctype html>
          <html>
            <body style="background:#09090b;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
              <p>Google Sign-In is not configured on this server.</p>
            </body>
          </html>
        `);
      }
      const target = `${authService.frontendUrl.replace(/\/$/, '')}/?auth_error=google_not_configured`;
      return reply.redirect(target);
    }

    const fallbackCallback = resolveDynamicCallbackUrl(request);
    const { authUrl, stateToken } = authService.createGoogleAuthorizationUrl(fallbackCallback, {
      source: isExtension ? 'extension' : 'web',
    });
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

        const { tokens, statePayload, user } = await authService.authenticateGoogleCallback({
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

        const isExtension = (statePayload as unknown as Record<string, unknown>)?.source === 'extension';
        if (isExtension) {
          return reply.type('text/html').send(`
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8" />
                <title>Specter Companion - Authenticated</title>
                <style>
                  body {
                    background: #09090b;
                    color: #fafafa;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                    text-align: center;
                    padding: 20px;
                  }
                  .card {
                    background: #18181b;
                    border: 1px solid #27272a;
                    border-radius: 12px;
                    padding: 24px 32px;
                    max-width: 380px;
                  }
                  .check {
                    font-size: 32px;
                    margin-bottom: 8px;
                  }
                  h2 {
                    margin: 0 0 8px 0;
                    font-size: 18px;
                  }
                  p {
                    color: #a1a1aa;
                    font-size: 13px;
                    margin: 0;
                  }
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="check">✅</div>
                  <h2>Connected to Specter</h2>
                  <p>Authenticated as <strong>${user.email}</strong>.<br />Closing window...</p>
                </div>
                <script>
                  setTimeout(() => {
                    window.close();
                  }, 800);
                </script>
              </body>
            </html>
          `);
        }

        return reply.redirect(`${frontendBase}/`);
      } catch {
        return reply.redirect(`${frontendBase}/?auth_error=google_failed`);
      }
    }
  );
}
