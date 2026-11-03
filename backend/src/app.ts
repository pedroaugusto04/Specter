import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { centralErrorHandler } from './middlewares/errorHandler.js';
import { InMemoryRealtimeEventBus } from './providers/realtime/inMemoryRealtime.provider.js';
import { DrizzleSessionRepository } from './repositories/sessionRepository.js';
import { registerAuthRoutes } from './routes/authRoutes.js';
import { registerIntegrationRoutes } from './routes/integrationRoutes.js';
import { registerJobRoutes } from './routes/jobRoutes.js';
import { registerRealtimeRoutes } from './routes/realtimeRoutes.js';
import { registerSessionRoutes } from './routes/sessionRoutes.js';
import type { AuthService } from './services/authService.js';
import type { IntegrationService } from './services/integrationService.js';
import type { JobService } from './services/jobService.js';
import { RealtimeService } from './services/realtimeService.js';
import { SessionService } from './services/sessionService.js';

export interface BuildAppOptions {
  jobService: JobService;
  authService: AuthService;
  integrationService: IntegrationService;
  sessionService?: SessionService;
  realtimeService?: RealtimeService;
  enableLogger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.enableLogger ?? env.NODE_ENV !== 'test',
  });

  app.decorateRequest('user', null);
  app.setErrorHandler(centralErrorHandler);

  const sessionService =
    options.sessionService ?? new SessionService(new DrizzleSessionRepository());
  const realtimeService =
    options.realtimeService ?? new RealtimeService(new InMemoryRealtimeEventBus());

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return cb(null, true);
      // Allow all Chrome/Chromium extensions
      if (origin.startsWith('chrome-extension://')) return cb(null, true);
      // Check configured CORS origins
      const allowed =
        env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim());
      if (allowed === true || allowed.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  registerAuthRoutes(app, options.authService);
  registerIntegrationRoutes(app, options.integrationService, options.authService);
  registerJobRoutes(app, options.jobService, options.authService);
  registerSessionRoutes(app, sessionService, options.authService);
  registerRealtimeRoutes(app, realtimeService, options.authService);

  return app;
}
