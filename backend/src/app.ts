import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { registerAuthRoutes } from './routes/authRoutes.js';
import { registerIntegrationRoutes } from './routes/integrationRoutes.js';
import { registerJobRoutes } from './routes/jobRoutes.js';
import type { AuthService } from './services/authService.js';
import type { IntegrationService } from './services/integrationService.js';
import type { JobService } from './services/jobService.js';

export interface BuildAppOptions {
  jobService: JobService;
  authService?: AuthService;
  integrationService?: IntegrationService;
  enableLogger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.enableLogger ?? env.NODE_ENV !== 'test',
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  if (options.authService) {
    registerAuthRoutes(app, options.authService);
  }
  if (options.integrationService) {
    registerIntegrationRoutes(app, options.integrationService, options.authService);
  }
  registerJobRoutes(app, options.jobService, options.authService);

  return app;
}
