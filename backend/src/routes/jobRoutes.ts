import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { DashboardMapper } from '../mappers/dashboardMapper.js';
import { optionalAuth, requireAuth, requireUser } from '../middlewares/authMiddleware.js';
import type { AuthService } from '../services/authService.js';
import type { JobService } from '../services/jobService.js';
import type { QuotaService } from '../services/quotaService.js';
import { createPaginationMeta } from '../utils/pagination.js';
import {
  jobInputSchema,
  jobPauseSchema,
  jobPlanVersionsQuerySchema,
  jobProbeSchema,
  jobRunsQuerySchema,
  jobTimeseriesQuerySchema,
  jobUpdateSchema,
  listQuerySchema,
  rollbackJobSchema,
} from './schemas.js';

export function registerJobRoutes(
  app: FastifyInstance,
  jobService: JobService,
  authService: AuthService,
  quotaService: QuotaService
): void {
  const withAuth = requireAuth(authService);
  const withOptionalAuth = optionalAuth(authService);

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/quotas', { preHandler: [withAuth] }, async (request) => {
    const user = requireUser(request);
    return { data: await quotaService.getQuotaSummary(user.id) };
  });

  app.get('/api/stats', { preHandler: [withOptionalAuth] }, async (request) => {
    const user = request.user;
    if (!user) {
      return { data: DashboardMapper.emptyDto() };
    }
    return { data: await jobService.getDashboardStats(user.id) };
  });

  app.get('/api/jobs', { preHandler: [withOptionalAuth] }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const user = request.user;
    if (!user) {
      return {
        data: { items: [], pagination: createPaginationMeta(query.page, query.pageSize, 0) },
      };
    }
    return { data: await jobService.listJobsPage({ ...query, userId: user.id }) };
  });

  app.post(
    '/api/jobs/probe',
    {
      preHandler: [withOptionalAuth],
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_PROBE_MAX,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request) => (request.user ? `user:${request.user.id}` : request.ip),
        },
      },
    },
    async (request, reply) => {
      const { url } = jobProbeSchema.parse(request.body);
      const result = await jobService.probeUrl(url, request.user?.id);
      return reply.status(200).send({ data: result });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      return { data: await jobService.getJobById(request.params.id, user.id) };
    }
  );

  app.post('/api/jobs', { preHandler: [withAuth] }, async (request, reply) => {
    const user = requireUser(request);
    const input = jobInputSchema.parse(request.body);
    const created = await jobService.createJob({ ...input, userId: user.id });
    return reply.status(201).send({ data: created });
  });

  app.patch<{ Params: { id: string } }>(
    '/api/jobs/:id',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const input = jobUpdateSchema.parse(request.body);
      return { data: await jobService.updateJob(request.params.id, input, user.id) };
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/api/jobs/:id/pause',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const { paused } = jobPauseSchema.parse(request.body);
      return { data: await jobService.setJobPauseState(request.params.id, paused, user.id) };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/trigger',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      return { data: await jobService.triggerManualScrape(request.params.id, user.id) };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/recompile',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      return { data: await jobService.triggerManualRecompile(request.params.id, user.id) };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/cancel-compilation',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      return { data: await jobService.cancelCompilation(request.params.id, user.id) };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id/runs',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const query = jobRunsQuerySchema.parse(request.query);
      return {
        data: await jobService.getJobRuns(request.params.id, query.page, query.pageSize, user.id),
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id/timeseries',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const query = jobTimeseriesQuerySchema.parse(request.query);
      return {
        data: await jobService.getJobTimeseries(
          request.params.id,
          query.range,
          query.page,
          query.pageSize,
          user.id
        ),
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id/versions',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const query = jobPlanVersionsQuerySchema.parse(request.query);
      return {
        data: await jobService.listPlanVersions(
          request.params.id,
          query.page,
          query.pageSize,
          user.id
        ),
      };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/rollback',
    { preHandler: [withAuth] },
    async (request) => {
      const user = requireUser(request);
      const body = rollbackJobSchema.parse(request.body);
      return {
        data: await jobService.rollbackPlanVersion(request.params.id, body.versionNumber, user.id),
      };
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
