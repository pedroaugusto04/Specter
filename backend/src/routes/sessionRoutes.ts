import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../services/authService.js';
import type { SessionService } from '../services/sessionService.js';
import { resolveAuthenticatedUser } from './authRoutes.js';
import { syncSessionSchema } from './schemas.js';

export function registerSessionRoutes(
  app: FastifyInstance,
  sessionService: SessionService,
  authService: AuthService
): void {
  // List all authenticated web sessions for the logged-in user
  app.get('/api/sessions', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const sessions = await sessionService.listSessions(user!.id);
    return reply.status(200).send({ data: sessions });
  });

  // Check if a specific domain or URL has a saved session
  app.get<{ Querystring: { domain?: string; url?: string } }>(
    '/api/sessions/check',
    async (request, reply) => {
      const user = await resolveAuthenticatedUser(request, reply, authService, true);
      const target = request.query.domain || request.query.url;

      if (!target) {
        return reply.status(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Query parameter "domain" or "url" is required.',
        });
      }

      const session = await sessionService.checkSession(user!.id, target);
      return reply.status(200).send({
        data: {
          hasSession: Boolean(session),
          session: session ?? null,
        },
      });
    }
  );

  // Sync / Upload cookies from the browser extension
  app.post('/api/sessions/sync', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const input = syncSessionSchema.parse(request.body);

    const session = await sessionService.syncSession(user!.id, input);
    return reply.status(200).send({
      message: `Session for ${session.domain} synchronized successfully with ${session.cookieCount} cookies.`,
      data: session,
    });
  });

  // Delete a saved session
  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const success = await sessionService.deleteSession(user!.id, request.params.id);

    if (!success) {
      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: 'Session not found or already deleted.',
      });
    }

    return reply.status(204).send();
  });
}
