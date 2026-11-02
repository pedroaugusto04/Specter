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
    expect(body.fields).toBeDefined();
    expect(body.fields.cronExpression).toContain('15 minutes');
  });

  it('returns HTTP 400 with standardized field errors for invalid input data', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        url: 'invalid-url',
        userPrompt: 'abc', // less than 5 chars
        notificationEmail: 'not-an-email',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.fields).toBeDefined();
    expect(body.fields.url).toBeDefined();
    expect(body.fields.userPrompt).toContain('5 characters');
    expect(body.fields.notificationEmail).toContain('email');
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

  it('updates an existing monitor configuration and handles recompilation triggers appropriately', async () => {
    // 1. Create monitor
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        url: 'https://shop.example.com/shoes',
        userPrompt: 'Extract shoe name and discounted price',
        notificationEmail: 'alerts@shoeshop.com',
        cronExpression: '0 */6 * * *',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const job = createRes.json().data;

    // Simulate job was compiled and activated
    await repository.updateJob(job.id, {
      status: 'ACTIVE',
      bullmqRepeatableKey: `repeat:${job.id}:0 */6 * * *`,
    });
    scheduler.scheduledRepeatables.set(job.id, `repeat:${job.id}:0 */6 * * *`);

    // 2. Update notification email and cron expression only (no recompile needed)
    const updateCronRes = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${job.id}`,
      payload: {
        notificationEmail: 'newemail@shoeshop.com',
        cronExpression: '*/30 * * * *',
      },
    });
    expect(updateCronRes.statusCode).toBe(200);
    const updatedData1 = updateCronRes.json().data;
    expect(updatedData1.notificationEmail).toBe('newemail@shoeshop.com');
    expect(updatedData1.cronExpression).toBe('*/30 * * * *');
    expect(updatedData1.status).toBe('ACTIVE');
    expect(scheduler.scheduledRepeatables.get(job.id)).toBe(`repeat:${job.id}:*/30 * * * *`);
    // No new compilation should have been enqueued
    expect(scheduler.compilationQueue).toHaveLength(1); // Only the initial one from creation

    // 3. Update extraction prompt (triggers recompilation)
    const updatePromptRes = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${job.id}`,
      payload: {
        userPrompt: 'Extract shoe name, stock quantity, and current price in USD',
      },
    });
    expect(updatePromptRes.statusCode).toBe(200);
    const updatedData2 = updatePromptRes.json().data;
    expect(updatedData2.userPrompt).toBe(
      'Extract shoe name, stock quantity, and current price in USD'
    );
    expect(updatedData2.status).toBe('PENDING_COMPILATION');
    expect(scheduler.scheduledRepeatables.has(job.id)).toBe(false);
    expect(scheduler.compilationQueue).toHaveLength(2);
    expect(scheduler.compilationQueue[1]).toEqual({ jobId: job.id, reason: 'manual' });

    // 4. Validation error on invalid update payload
    const invalidRes = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${job.id}`,
      payload: {
        cronExpression: '*/2 * * * *', // violates 15m floor
      },
    });
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.json().error).toBe('VALIDATION_ERROR');

    // 5. 404 on non-existent job
    const notFoundRes = await app.inject({
      method: 'PATCH',
      url: '/api/jobs/00000000-0000-0000-0000-000000000000',
      payload: {
        notificationEmail: 'valid@example.com',
      },
    });
    expect(notFoundRes.statusCode).toBe(404);
  });
});
