import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { isAllowedCorsOrigin } from './utils/corsHelper.js';
import { centralErrorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { registerAuthRoutes } from './routes/authRoutes.js';
import { registerIntegrationRoutes } from './routes/integrationRoutes.js';
import { registerJobRoutes } from './routes/jobRoutes.js';
import { registerRealtimeRoutes } from './routes/realtimeRoutes.js';
import { registerSessionRoutes } from './routes/sessionRoutes.js';
import type { AuthService } from './services/authService.js';
import type { IntegrationService } from './services/integrationService.js';
import type { JobService } from './services/jobService.js';
import type { QuotaService } from './services/quotaService.js';
import { RealtimeService } from './services/realtimeService.js';
import { SessionService } from './services/sessionService.js';

export interface BuildAppOptions {
  jobService: JobService;
  authService: AuthService;
  integrationService: IntegrationService;
  sessionService: SessionService;
  realtimeService: RealtimeService;
  quotaService: QuotaService;
  enableLogger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.enableLogger ?? env.NODE_ENV !== 'test',
  });

  app.decorateRequest('user', null);
  app.setErrorHandler(centralErrorHandler);
  app.setNotFoundHandler(notFoundHandler);

  const sessionService = options.sessionService;
  const realtimeService = options.realtimeService;

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_GLOBAL_MAX,
    timeWindow: '1 minute',
    allowList: (req) => {
      // In test environment, bypass rate limit unless testing it
      if (env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
        return true;
      }
      return false;
    },
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfterSeconds: Math.ceil(context.ttl / 1000),
    }),
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, isAllowedCorsOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  registerAuthRoutes(app, options.authService);
  registerIntegrationRoutes(app, options.integrationService, options.authService);
  registerJobRoutes(app, options.jobService, options.authService, options.quotaService);
  registerSessionRoutes(app, sessionService, options.authService);
  registerRealtimeRoutes(app, realtimeService, options.authService);

  return app;
}
