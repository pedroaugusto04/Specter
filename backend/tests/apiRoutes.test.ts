import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { AntiBotBlockedError } from '../src/errors/domainErrors.js';
import { JobService } from '../src/services/jobService.js';
import {
  InMemoryJobRepository,
  MockJobScheduler,
  MockScraperEngine,
} from './helpers/testDoubles.js';

describe('Fastify REST API Endpoints (Black-Box Behavioral Tests)', () => {
  let app: FastifyInstance;
  let repository: InMemoryJobRepository;
  let scheduler: MockJobScheduler;
  let scraperEngine: MockScraperEngine;

  beforeEach(async () => {
    repository = new InMemoryJobRepository();
    scheduler = new MockJobScheduler();
    scraperEngine = new MockScraperEngine();
    const jobService = new JobService(repository, scheduler, scraperEngine);
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

    // Resume job
    const resumeRes = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${jobId}/pause`,
      payload: { paused: false },
    });
    expect(resumeRes.statusCode).toBe(200);

    // Trigger manual scrape
    const triggerRes = await app.inject({
      method: 'POST',
      url: `/api/jobs/${jobId}/trigger`,
    });
    expect(triggerRes.statusCode).toBe(200);

    // List jobs
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/jobs',
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data).toHaveLength(1);

    // Delete job
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/jobs/${jobId}`,
    });
    expect(deleteRes.statusCode).toBe(204);

    const checkRes = await app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}`,
    });
    expect(checkRes.statusCode).toBe(404);
  });

  it('supports partial configuration update (PATCH /api/jobs/:id) and enqueues re-compilation on target changes', async () => {
    // 1. Create initial job
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        url: 'https://store.example.com/shoes',
        userPrompt: 'Extract shoe name and current price in USD',
        notificationEmail: 'buyer@example.com',
        cronExpression: '0 */6 * * *',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const job = createRes.json().data;

    // Simulate compilation completing and job being ACTIVE with a scheduled repeatable
    await repository.updateJob(job.id, {
      status: 'ACTIVE',
      extractorConfig: { fields: { title: 'h1', price: '.price' } },
      bullmqRepeatableKey: 'repeat:fake-key',
    });
    scheduler.scheduledRepeatables.set(job.id, 'repeat:fake-key');

    // 2. Update cron expression only: should update schedule without triggering re-compilation
    const updateCronRes = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${job.id}`,
      payload: {
        cronExpression: '0 */12 * * *',
      },
    });
    expect(updateCronRes.statusCode).toBe(200);
    const updatedData1 = updateCronRes.json().data;
    expect(updatedData1.cronExpression).toBe('0 */12 * * *');
    expect(updatedData1.status).toBe('ACTIVE');
    expect(scheduler.scheduledRepeatables.get(job.id)).toBe(`repeat:${job.id}:0 */12 * * *`);
    expect(scheduler.compilationQueue).toHaveLength(1); // Only initial compilation, not re-queued

    // 3. Update prompt: should invalidate schema, reset repeatable, and re-enqueue compilation
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

  it('pre-flight probe endpoint (POST /api/jobs/probe) reports accessibility and blocks anti-bot protected sites', async () => {
    // 1. Accessible URL
    const okRes = await app.inject({
      method: 'POST',
      url: '/api/jobs/probe',
      payload: {
        url: 'https://news.example.com/articles',
      },
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json().data).toEqual({ accessible: true });

    // 2. Protected URL (e.g. Mercado Livre / Cloudflare anti-bot challenge)
    scraperEngine.setHandler(async () => {
      throw new AntiBotBlockedError('Cloudflare challenge detected', 403);
    });

    const blockedRes = await app.inject({
      method: 'POST',
      url: '/api/jobs/probe',
      payload: {
        url: 'https://www.mercadolivre.com.br/produto-xyz',
      },
    });
    expect(blockedRes.statusCode).toBe(200);
    const blockedData = blockedRes.json().data;
    expect(blockedData.accessible).toBe(false);
    expect(blockedData.reason).toContain('Anti-Bot / CAPTCHA');

    // 3. Creating a job delegates anti-bot resolution to the background compilation queue without blocking the form
    const createJobRes = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        url: 'https://www.mercadolivre.com.br/produto-xyz',
        userPrompt: 'Extract title and price',
        notificationEmail: 'user@example.com',
      },
    });
    expect(createJobRes.statusCode).toBe(201);
    const createdData = createJobRes.json().data;
    expect(createdData.status).toBe('PENDING_COMPILATION');
    expect(repository.jobs.size).toBe(1);
    expect(scheduler.compilationQueue).toHaveLength(1);
  });
});
