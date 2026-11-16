import type { FastifyInstance } from 'fastify';
import { optionalAuth, requireAuth, requireUser } from '../middlewares/authMiddleware.js';
import type { AuthService } from '../services/authService.js';
import type { JobService } from '../services/jobService.js';
import type { QuotaService } from '../services/quotaService.js';
import {
  jobInputSchema,
  jobPauseSchema,
  jobProbeSchema,
  jobRunsQuerySchema,
  jobTimeseriesQuerySchema,
  jobStatusQuerySchema,
  jobUpdateSchema,
} from './schemas.js';

export function registerJobRoutes(
  app: FastifyInstance,
  jobService: JobService,
  authService: AuthService,
  quotaService?: QuotaService
): void {
  const withAuth = requireAuth(authService);
  const withOptionalAuth = optionalAuth(authService);

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/quotas', { preHandler: [withAuth] }, async (request) => {
    const user = requireUser(request);
    if (!quotaService) {
      return { data: null };
    }
    const summary = await quotaService.getQuotaSummary(user.id);
    return { data: summary };
  });

  app.get('/api/stats', { preHandler: [withOptionalAuth] }, async (request) => {
    const user = request.user;
    if (!user) {
      return {
        data: {
          totalJobs: 0,
          activeJobs: 0,
          recoveringOrCompilingJobs: 0,
          failedOrPausedJobs: 0,
          totalRuns: 0,
          DetectedChangesCount: 0,
        },
      };
    }
    const stats = await jobService.getDashboardStats(user.id);
    return { data: stats };
  });

  app.get('/api/jobs', { preHandler: [withOptionalAuth] }, async (request) => {
    const query = jobStatusQuerySchema.parse(request.query);
    const user = request.user;
    if (!user) {
      return { data: [] };
    }
    const jobs = await jobService.listJobs(query.status, user.id);
    return { data: jobs };
  });

  app.post('/api/jobs/probe', { preHandler: [withOptionalAuth] }, async (request, reply) => {
    const user = request.user;
    const { url } = jobProbeSchema.parse(request.body);
    const result = await jobService.probeUrl(url, user?.id);
    return reply.status(200).send({ data: result });
  });

  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const job = await jobService.getJobById(request.params.id, user.id);
      return { data: job };
    }
  );

  app.post('/api/jobs', { preHandler: [withAuth] }, async (request, reply) => {
    const user = requireUser(request);
    const input = jobInputSchema.parse(request.body);
    const created = await jobService.createJob({
      ...input,
      userId: user.id,
    });
    return reply.status(201).send({ data: created });
  });

  app.patch<{ Params: { id: string } }>(
    '/api/jobs/:id',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const input = jobUpdateSchema.parse(request.body);
      const updated = await jobService.updateJob(request.params.id, input, user.id);
      return { data: updated };
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/api/jobs/:id/pause',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const { paused } = jobPauseSchema.parse(request.body);
      const updated = await jobService.setJobPauseState(request.params.id, paused, user.id);
      return { data: updated };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/trigger',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const result = await jobService.triggerManualScrape(request.params.id, user.id);
      return { data: result };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/recompile',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const updated = await jobService.triggerManualRecompile(request.params.id, user.id);
      return { data: updated };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/cancel-compilation',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const updated = await jobService.cancelCompilation(request.params.id, user.id);
      return { data: updated };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id/runs',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const query = jobRunsQuerySchema.parse(request.query);
      const result = await jobService.getJobRuns(
        request.params.id,
        query.page,
        query.pageSize,
        user.id
      );
      return { data: result };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id/timeseries',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const query = jobTimeseriesQuerySchema.parse(request.query);
      const result = await jobService.getJobTimeseries(request.params.id, query.range, user.id);
      return { data: result };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/api/jobs/:id',
    { preHandler: [withAuth] },
    async (request, reply) => {
      const user = requireUser(request);
      await jobService.deleteJob(request.params.id, user.id);
      return reply.status(204).send();
    }
  );
}
