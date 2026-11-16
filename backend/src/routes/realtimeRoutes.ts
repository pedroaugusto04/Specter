import { env } from '../config/env.js';
import { toRealtimeDto } from '../mappers/realtimeMapper.js';
import type { FastifyInstance } from 'fastify';
import { requireAuth, requireUser } from '../middlewares/authMiddleware.js';
import type { AuthService } from '../services/authService.js';
import type { RealtimeService } from '../services/realtimeService.js';

function resolveCorsOriginHeader(origin: string | undefined): string | null {
  if (!origin) return null;
  if (origin.startsWith('chrome-extension://')) {
    const allowedExtId = env.CHROME_EXTENSION_ID;
    if (!allowedExtId || env.NODE_ENV !== 'production' || origin === `chrome-extension://${allowedExtId}`) {
      return origin;
    }
    return null;
  }
  const allowed = env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim());
  if (allowed === true || allowed.includes(origin)) {
    return origin;
  }
  return null;
}

export function registerRealtimeRoutes(
  app: FastifyInstance,
  realtimeService: RealtimeService,
  authService: AuthService
): void {
  const withAuth = requireAuth(authService);

  app.get('/api/events', { preHandler: [withAuth] }, async (request, reply) => {
    const userId = requireUser(request).id;

    reply.hijack();

    const raw = reply.raw;
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
    const allowedOrigin = resolveCorsOriginHeader(origin);

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

    raw.writeHead(200, headers);

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
        raw.write(`event: ${event.type}\ndata: ${JSON.stringify(toRealtimeDto(event))}\n\n`);
      }
    });

    // Teardown subscriber and timer on client disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
    });
  });
}
