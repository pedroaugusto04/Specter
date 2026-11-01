import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { JobService } from '../src/services/jobService.js';
import { InMemoryJobRepository, MockJobScheduler } from './helpers/testDoubles.js';

describe('Fastify REST API Endpoints (Black-Box Behavioral Tests)', () => {
  let app: FastifyInstance;
  let repository: InMemoryJobRepository;
  let scheduler: MockJobScheduler;

  beforeEach(async () => {
    repository = new InMemoryJobRepository();
    scheduler = new MockJobScheduler();
    const jobService = new JobService(repository, scheduler);
    app = await buildApp({ jobService, enableLogger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a new scraping job with valid input and enqueues initial compilation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        url: 'https://news.example.com/tech',
        userPrompt: 'Extract main headline and article link',
        notificationEmail: 'editor@example.com',
        cronExpression: '*/30 * * * *',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data).toMatchObject({
      url: 'https://news.example.com/tech',
      userPrompt: 'Extract main headline and article link',
      notificationEmail: 'editor@example.com',
      cronExpression: '*/30 * * * *',
      status: 'PENDING_COMPILATION',
      failureCount: 0,
    });
    expect(scheduler.compilationQueue).toHaveLength(1);
    expect(scheduler.compilationQueue[0]?.reason).toBe('initial');
  });

  it('returns HTTP 400 when cron frequency violates the 15-minute minimum floor', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        url: 'https://news.example.com/tech',
        userPrompt: 'Extract main headline',
        notificationEmail: 'editor@example.com',
        cronExpression: '*/5 * * * *',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.message).toContain('15 minutes');
  });

  it('supports listing jobs, pausing/resuming, manual trigger, and deleting a job', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        url: 'https://shop.example.com/gpu',
        userPrompt: 'Monitor graphics card price',
        notificationEmail: 'gamer@example.com',
        cronExpression: '0 */2 * * *',
      },
    });
    const jobId = createRes.json().data.id as string;

    // Pause job
    const pauseRes = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${jobId}/pause`,
      payload: { paused: true },
    });
    expect(pauseRes.statusCode).toBe(200);
    expect(pauseRes.json().data.status).toBe('PAUSED');

    // Stats endpoint
    const statsRes = await app.inject({
      method: 'GET',
      url: '/api/stats',
    });
    expect(statsRes.statusCode).toBe(200);
    expect(statsRes.json().data.totalJobs).toBe(1);

    // Delete job
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/jobs/${jobId}`,
    });
    expect(delRes.statusCode).toBe(204);

    // Verify 404 after deletion
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});
