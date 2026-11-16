import { toRealtimeDto } from '../mappers/realtimeMapper.js';
import type { FastifyInstance } from 'fastify';
import { requireAuth, requireUser } from '../middlewares/authMiddleware.js';
import type { AuthService } from '../services/authService.js';
import type { RealtimeService } from '../services/realtimeService.js';
import { isAllowedCorsOrigin } from '../utils/corsHelper.js';

export function registerRealtimeRoutes(
  app: FastifyInstance,
  realtimeService: RealtimeService,
  authService: AuthService
): void {
  const withAuth = requireAuth(authService);

  app.get('/api/events', { preHandler: [withAuth] }, async (request, reply) => {
    const userId = requireUser(request).id;
    const raw = reply.raw;
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
    const allowedOrigin = origin && isAllowedCorsOrigin(origin) ? origin : null;

    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = allowedOrigin;
      headers['Vary'] = 'Origin';
    }

    let unsubscribe: (() => void) | undefined;
    const pendingEvents: string[] = [];
    let streamReady = false;
    try {
      // Wait for Redis SUBSCRIBE acknowledgement before confirming the SSE connection.
      unsubscribe = await realtimeService.subscribeUser(userId, (event) => {
        if (!raw.writableEnded && !raw.destroyed) {
          const message = `event: ${event.type}\ndata: ${JSON.stringify(toRealtimeDto(event))}\n\n`;
          if (streamReady) raw.write(message);
          else pendingEvents.push(message);
        }
      });
    } catch {
      return reply.code(503).send({ error: 'Realtime event stream is temporarily unavailable' });
    }

    reply.hijack();
    raw.writeHead(200, headers);
    streamReady = true;
    for (const event of pendingEvents) raw.write(event);
    pendingEvents.length = 0;

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

    // Teardown subscriber and timer on client disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeatTimer);
      unsubscribe?.();
    });
  });
}
