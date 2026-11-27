import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticationRequiredError } from '../errors/domainErrors.js';
import type { UserDto } from '@specter/contracts';
import type { AuthService } from '../services/authService.js';
import { ACCESS_COOKIE_NAME, parseCookies, REFRESH_COOKIE_NAME } from '../utils/cookies.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserDto | null;
  }
}

/**
 * Resolves the authenticated user from bearer token or cookies, refreshing tokens if needed.
 */
async function resolveAuthenticatedUser(
  request: FastifyRequest,
  reply: FastifyReply,
  authService: AuthService,
  requireAuth = false
): Promise<UserDto | null> {
  const cookies = parseCookies(request.headers.cookie);
  const authHeader = request.headers.authorization;
  const bearerToken =
    authHeader && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

  const session = await authService.resolveSession(
    bearerToken || cookies[ACCESS_COOKIE_NAME],
    cookies[REFRESH_COOKIE_NAME]
  );

  if (session?.refreshedTokens) {
    reply.header('Set-Cookie', authService.buildAuthCookies(session.refreshedTokens));
  }

  const user = session?.user ?? null;
  request.user = user;

  if (!user && requireAuth) {
    throw new AuthenticationRequiredError();
  }

  return user;
}

/**
 * Pre-handler hook requiring an authenticated user.
 */
export function requireAuth(
  authService: AuthService
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    await resolveAuthenticatedUser(request, reply, authService, true);
  };
}

/**
 * Pre-handler hook allowing anonymous access while populating request.user if credentials exist.
 */
export function optionalAuth(
  authService: AuthService
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    await resolveAuthenticatedUser(request, reply, authService, false);
  };
}

/**
 * Safe accessor that returns the authenticated user or throws AuthenticationRequiredError.
 */
export function requireUser(request: FastifyRequest): UserDto {
  if (!request.user) {
    throw new AuthenticationRequiredError();
  }
  return request.user;
}
