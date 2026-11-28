import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

const BASE_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
];

export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (_request, reply, payload) => {
    for (const [header, value] of BASE_SECURITY_HEADERS) {
      reply.header(header, value);
    }
    if (env.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return payload;
  });
}
