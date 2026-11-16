import type { FastifyInstance } from 'fastify';
import { requireAuth, requireUser } from '../middlewares/authMiddleware.js';
import type { AuthService } from '../services/authService.js';
import type { SessionService } from '../services/sessionService.js';
import { sessionCheckQuerySchema, syncSessionSchema } from './schemas.js';

export function registerSessionRoutes(
  app: FastifyInstance,
  sessionService: SessionService,
  authService: AuthService
): void {
  const withAuth = requireAuth(authService);

  // List all authenticated web sessions for the logged-in user
  app.get('/api/sessions', { preHandler: [withAuth] }, async (request, reply) => {
    const user = requireUser(request);
    const sessions = await sessionService.listSessions(user.id);
    return reply.status(200).send({ data: sessions });
  });

  // Check if a specific domain or URL has a saved session
  app.get('/api/sessions/check', { preHandler: [withAuth] }, async (request, reply) => {
    const user = requireUser(request);
    const query = sessionCheckQuerySchema.parse(request.query);
    const target = (query.domain || query.url)!;
    const session = await sessionService.checkSession(user.id, target);
    return reply.status(200).send({
      data: {
        hasSession: Boolean(session),
        session: session ?? null,
      },
    });
  });

  // Sync / Upload cookies from the browser extension
  app.post('/api/sessions/sync', { preHandler: [withAuth] }, async (request, reply) => {
    const user = requireUser(request);
    const input = syncSessionSchema.parse(request.body);

    const session = await sessionService.syncSession(user.id, input);
    return reply.status(200).send({
      message: `Session for ${session.domain} synchronized successfully with ${session.cookieCount} cookies.`,
      data: session,
    });
  });

  // Delete a saved session
  app.delete<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: [withAuth] },
    async (request, reply) => {
      const user = requireUser(request);
      const success = await sessionService.deleteSession(user.id, request.params.id);

      if (!success) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Session not found or already deleted.',
        });
      }

      return reply.status(204).send();
    }
  );
}
