import type { FastifyInstance } from 'fastify';
import { optionalAuth } from '../middlewares/authMiddleware.js';
import type { AuthService } from '../services/authService.js';
import type { RealtimeService } from '../services/realtimeService.js';

export function registerRealtimeRoutes(
  app: FastifyInstance,
  realtimeService: RealtimeService,
  authService: AuthService
): void {
  const withOptionalAuth = optionalAuth(authService);

  app.get(
    '/api/events',
    { preHandler: [withOptionalAuth] },
    async (request, reply) => {
      const user = request.user;
      const userId = user?.id ?? 'default-user';

      reply.hijack();

      const raw = reply.raw;

      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Credentials': 'true',
      });

      if (typeof raw.flushHeaders === 'function') {
        raw.flushHeaders();
      }

      // Initial connection acknowledgement
      const connectedPayload = JSON.stringify({
        type: 'CONNECTED',
        userId,
        timestamp: new Date().toISOString(),
      });
      raw.write(`event: connected\ndata: ${connectedPayload}\n\n`);

      // Heartbeat interval to prevent intermediate reverse proxies (Nginx, Traefik, Cloudflare) from timing out
      const heartbeatTimer = setInterval(() => {
        if (!raw.writableEnded && !raw.destroyed) {
          raw.write(': keepalive\n\n');
        }
      }, 20_000);

      // Subscribe to domain events dispatched for this specific user
      const unsubscribe = realtimeService.subscribeUser(userId, (event) => {
        if (!raw.writableEnded && !raw.destroyed) {
          raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        }
      });

      // Teardown subscriber and timer on client disconnect
      request.raw.on('close', () => {
        clearInterval(heartbeatTimer);
        unsubscribe();
      });
    }
  );
}
