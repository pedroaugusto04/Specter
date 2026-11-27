import type { FastifyInstance } from 'fastify';
import { requireAuth, requireUser } from '../middlewares/authMiddleware.js';
import type { AuthService } from '../services/authService.js';
import type { SessionService } from '../services/sessionService.js';
import { paginationQuerySchema, sessionCheckQuerySchema, syncSessionSchema } from './schemas.js';

export function registerSessionRoutes(
  app: FastifyInstance,
  sessionService: SessionService,
  authService: AuthService
): void {
  const withAuth = requireAuth(authService);

  app.get('/api/sessions', { preHandler: [withAuth] }, async (request, reply) => {
    const user = requireUser(request);
    const query = paginationQuerySchema.parse(request.query);
    const sessions = await sessionService.listSessionsPage(user.id, query.page, query.pageSize);
    return reply.status(200).send({ data: sessions });
  });

  app.get('/api/sessions/check', { preHandler: [withAuth] }, async (request, reply) => {
    const user = requireUser(request);
    const query = sessionCheckQuerySchema.parse(request.query);
    const target = (query.domain || query.url)!;
    const session = await sessionService.checkSession(user.id, target);
    return reply.status(200).send({
      data: {
        hasSession: Boolean(session),
        session,
      },
    });
  });

  app.post('/api/sessions/sync', { preHandler: [withAuth] }, async (request, reply) => {
    const user = requireUser(request);
    const input = syncSessionSchema.parse(request.body);
    const session = await sessionService.syncSession(user.id, input);
    return reply.status(200).send({
      message: `Session for ${session.domain} synchronized successfully with ${session.cookieCount} cookies.`,
      data: session,
    });
  });

  app.delete<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: [withAuth] },
    async (request, reply) => {
      const user = requireUser(request);
      await sessionService.deleteSession(user.id, request.params.id);
      return reply.status(204).send();
    }
  );
}
