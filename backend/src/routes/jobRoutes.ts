import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError, ValidationError } from '../errors/domainErrors.js';
import type { AuthService } from '../services/authService.js';
import type { JobService } from '../services/jobService.js';
import { logger } from '../utils/logger.js';
import { resolveAuthenticatedUser } from './authRoutes.js';
import {
  jobInputSchema,
  jobPauseSchema,
  jobProbeSchema,
  jobRunsQuerySchema,
  jobStatusQuerySchema,
  jobUpdateSchema,
} from './schemas.js';

export function registerJobRoutes(
  app: FastifyInstance,
  jobService: JobService,
  authService: AuthService
): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const details = error.issues.map((i) => ({
        field: i.path.join('.') || 'root',
        message: i.message,
      }));
      const fields: Record<string, string> = {};
      for (const item of details) {
        if (!fields[item.field]) {
          fields[item.field] = item.message;
        }
      }
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: details[0]?.message ?? 'Invalid input data.',
        details,
        fields,
      });
    }

    if (error instanceof ValidationError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
        fields: error.fields,
      });
    }

    if (error instanceof DomainError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    logger.error('Unhandled API route error', {
      path: request.url,
      method: request.method,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error.',
    });
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/stats', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, false);
    if (!user) {
      return {
        data: {
          totalJobs: 0,
          activeJobs: 0,
          healingOrCompilingJobs: 0,
          failedOrPausedJobs: 0,
          totalRuns: 0,
          DetectedChangesCount: 0,
        },
      };
    }
    const stats = await jobService.getDashboardStats(user.id);
    return { data: stats };
  });

  app.get('/api/jobs', async (request, reply) => {
    const query = jobStatusQuerySchema.parse(request.query);
    const user = await resolveAuthenticatedUser(request, reply, authService, false);
    if (!user) {
      return { data: [] };
    }
    const jobs = await jobService.listJobs(query.status, user.id);
    return { data: jobs };
  });

  app.post('/api/jobs/probe', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, false);
    const { url } = jobProbeSchema.parse(request.body);
    const result = await jobService.probeUrl(url, user?.id);
    return reply.status(200).send({ data: result });
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const job = await jobService.getJobById(request.params.id, user!.id);
    return { data: job };
  });

  app.post('/api/jobs', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const input = jobInputSchema.parse(request.body);
    const created = await jobService.createJob({
      ...input,
      userId: user!.id,
    });
    return reply.status(201).send({ data: created });
  });

  app.patch<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const input = jobUpdateSchema.parse(request.body);
    const updated = await jobService.updateJob(request.params.id, input, user!.id);
    return { data: updated };
  });

  app.patch<{ Params: { id: string } }>('/api/jobs/:id/pause', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const { paused } = jobPauseSchema.parse(request.body);
    const updated = await jobService.setJobPauseState(request.params.id, paused, user!.id);
    return { data: updated };
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/trigger', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const result = await jobService.triggerManualScrape(request.params.id, user!.id);
    return { data: result };
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/recompile', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const updated = await jobService.triggerManualRecompile(request.params.id, user!.id);
    return { data: updated };
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id/runs', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    const query = jobRunsQuerySchema.parse(request.query);
    const result = await jobService.getJobRuns(request.params.id, query.limit, user!.id);
    return { data: result };
  });

  app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, true);
    await jobService.deleteJob(request.params.id, user!.id);
    return reply.status(204).send();
  });
}
