import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { RealtimeUnavailableError } from '../errors/domainErrors.js';
import { buildConnectedEvent, formatSseEvent, toRealtimeDto } from '../mappers/realtimeMapper.js';
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
  const streams = new Set<ServerResponse>();
  app.addHook('preClose', async () => {
    for (const stream of streams) stream.destroy();
  });

  app.get('/api/events', { preHandler: [withAuth] }, async (request, reply) => {
    const userId = requireUser(request).id;
    const raw = reply.raw;
    const origin = request.headers.origin;
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
    let streamReady = false;
    streams.add(raw);
    const heartbeatTimer = setInterval(() => {
      if (streamReady && !raw.writableEnded && !raw.destroyed) raw.write(': keepalive\n\n');
    }, 20_000);
    const cleanup = () => {
      streams.delete(raw);
      clearInterval(heartbeatTimer);
      unsubscribe?.();
    };
    raw.once('close', cleanup);

    try {
      // Wait for Redis SUBSCRIBE acknowledgement before confirming the SSE connection.
      unsubscribe = await realtimeService.subscribeUser(
        userId,
        (event) => {
          if (streamReady && !raw.writableEnded && !raw.destroyed) {
            raw.write(formatSseEvent(event.type, toRealtimeDto(event)));
          }
        },
        () => raw.destroy()
      );
    } catch (err) {
      cleanup();
      if (raw.destroyed) return;
      throw new RealtimeUnavailableError(err);
    }

    if (raw.destroyed) {
      cleanup();
      return;
    }

    reply.hijack();
    raw.writeHead(200, headers);
    streamReady = true;
    raw.flushHeaders();

    raw.write(formatSseEvent('connected', buildConnectedEvent(userId)));
  });
}
