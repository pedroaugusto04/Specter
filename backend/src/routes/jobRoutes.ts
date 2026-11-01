import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '../errors/domainErrors.js';
import type { JobService } from '../services/jobService.js';
import { logger } from '../utils/logger.js';
import {
  jobInputSchema,
  jobPauseSchema,
  jobRunsQuerySchema,
  jobStatusQuerySchema,
  jobUpdateSchema,
} from './schemas.js';

export function registerJobRoutes(app: FastifyInstance, jobService: JobService): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const details = error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: details[0]?.message ?? 'Invalid input data.',
        details,
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

  app.get('/api/stats', async () => {
    const stats = await jobService.getDashboardStats();
    return { data: stats };
  });

  app.get('/api/jobs', async (request) => {
    const query = jobStatusQuerySchema.parse(request.query);
    const jobs = await jobService.listJobs(query.status);
    return { data: jobs };
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request) => {
    const job = await jobService.getJobById(request.params.id);
    return { data: job };
  });

  app.post('/api/jobs', async (request, reply) => {
    const input = jobInputSchema.parse(request.body);
    const created = await jobService.createJob(input);
    return reply.status(201).send({ data: created });
  });

  app.patch<{ Params: { id: string } }>('/api/jobs/:id', async (request) => {
    const input = jobUpdateSchema.parse(request.body);
    const updated = await jobService.updateJob(request.params.id, input);
    return { data: updated };
  });

  app.patch<{ Params: { id: string } }>('/api/jobs/:id/pause', async (request) => {
    const { paused } = jobPauseSchema.parse(request.body);
    const updated = await jobService.setJobPauseState(request.params.id, paused);
    return { data: updated };
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/trigger', async (request) => {
    const result = await jobService.triggerManualScrape(request.params.id);
    return { data: result };
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/recompile', async (request) => {
    const updated = await jobService.triggerManualRecompile(request.params.id);
    return { data: updated };
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id/runs', async (request) => {
    const query = jobRunsQuerySchema.parse(request.query);
    const result = await jobService.getJobRuns(request.params.id, query.limit);
    return { data: result };
  });

  app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    await jobService.deleteJob(request.params.id);
    return reply.status(204).send();
  });
}
