import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors/domainErrors.js';
import type { UserDto } from '../mappers/userMapper.js';
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
export async function resolveAuthenticatedUser(
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

  const query = request.query as Record<string, unknown> | undefined;
  const queryToken = typeof query?.token === 'string' ? query.token : undefined;

  const session = await authService.resolveSession(
    bearerToken || cookies[ACCESS_COOKIE_NAME] || queryToken,
    cookies[REFRESH_COOKIE_NAME]
  );

  if (session?.refreshedTokens) {
    reply.header('Set-Cookie', authService.buildAuthCookies(session.refreshedTokens));
  }

  const user = session?.user ?? null;
  request.user = user;

  if (!user && requireAuth) {
    throw new UnauthorizedError('Please sign in to continue.');
  }

  return user;
}

export interface AuthMiddlewareOptions {
  required?: boolean;
}

/**
 * Fastify preHandler hook for centralized authentication and authorization.
 */
export function authenticate(
  authService: AuthService,
  options: AuthMiddlewareOptions = {}
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const required = options.required ?? false;
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await resolveAuthenticatedUser(request, reply, authService, required);
  };
}

/**
 * Pre-handler hook requiring an authenticated user.
 */
export function requireAuth(
  authService: AuthService
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return authenticate(authService, { required: true });
}

/**
 * Pre-handler hook allowing anonymous access while populating request.user if credentials exist.
 */
export function optionalAuth(
  authService: AuthService
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return authenticate(authService, { required: false });
}

/**
 * Safe accessor that returns the authenticated user or throws UnauthorizedError.
 * Eliminates non-null assertions like `request.user!.id`.
 */
export function requireUser(request: FastifyRequest): UserDto {
  if (!request.user) {
    throw new UnauthorizedError('Please sign in to continue.');
  }
  return request.user;
}
