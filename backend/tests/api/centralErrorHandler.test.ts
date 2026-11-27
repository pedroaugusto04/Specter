import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { centralErrorHandler, notFoundHandler } from '../../src/middlewares/errorHandler.js';
import {
  CompilationAlreadyInProgressError,
  NotFoundError,
  RealtimeUnavailableError,
  TelegramTestFailedError,
  UnauthorizedError,
  ValidationError,
  WebhookTestFailedError,
} from '../../src/errors/domainErrors.js';
import { toRealtimeDto } from '../../src/mappers/realtimeMapper.js';

describe('Centralized Error Handler Middleware', () => {
  it('formats ZodError into standard VALIDATION_ERROR response', async () => {
    const app = Fastify();
    app.setErrorHandler(centralErrorHandler);

    const schema = z.object({
      email: z.string().email('Invalid email address'),
      age: z.number().min(18, 'Must be at least 18'),
    });

    app.post('/test-zod', async (req) => {
      schema.parse(req.body);
      return { ok: true };
    });

    const res = await app.inject({
      method: 'POST',
      url: '/test-zod',
      payload: { email: 'not-an-email', age: 10 },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toHaveLength(2);
    expect(body.fields.email).toBe('Invalid email address');
    expect(body.fields.age).toBe('Must be at least 18');
  });

  it('formats ValidationError into status 400 with details and fields', async () => {
    const app = Fastify();
    app.setErrorHandler(centralErrorHandler);

    app.get('/test-validation', async () => {
      throw new ValidationError('Validation failed', [
        { field: 'name', message: 'Name is required' },
      ]);
    });

    const res = await app.inject({
      method: 'GET',
      url: '/test-validation',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toBeDefined();
    expect(body.fields?.name).toBe('Name is required');
  });

  it('formats DomainError (NotFoundError, UnauthorizedError) with correct status code', async () => {
    const app = Fastify();
    app.setErrorHandler(centralErrorHandler);

    app.get('/test-404', async () => {
      throw new NotFoundError('Item not found');
    });

    app.get('/test-401', async () => {
      throw new UnauthorizedError('Unauthorized access');
    });

    const res404 = await app.inject({ method: 'GET', url: '/test-404' });
    expect(res404.statusCode).toBe(404);
    expect(res404.json()).toEqual({
      error: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    });

    const res401 = await app.inject({ method: 'GET', url: '/test-401' });
    expect(res401.statusCode).toBe(401);
    expect(res401.json()).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Unauthorized access',
    });
  });

  it('catches unexpected generic errors and returns 500 without leaking sensitive internals', async () => {
    const app = Fastify();
    app.setErrorHandler(centralErrorHandler);

    app.get('/test-500', async () => {
      throw new Error('Database password was 12345');
    });

    const res = await app.inject({ method: 'GET', url: '/test-500' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'We could not complete this request. Please try again later.',
    });
  });

  it('preserves ConflictError, integration test failures, and realtime unavailability in centralErrorHandler', async () => {
    const app = Fastify();
    app.setErrorHandler(centralErrorHandler);

    app.get('/test-409', async () => {
      throw new CompilationAlreadyInProgressError();
    });
    app.get('/test-telegram', async () => {
      throw new TelegramTestFailedError('Bot was blocked by user');
    });
    app.get('/test-webhook', async () => {
      throw new WebhookTestFailedError('Endpoint returned 502', 502);
    });
    app.get('/test-503', async () => {
      throw new RealtimeUnavailableError();
    });

    const res409 = await app.inject({ method: 'GET', url: '/test-409' });
    expect(res409.statusCode).toBe(409);
    expect(res409.json()).toEqual({
      error: 'CONFLICT',
      message: 'A compilation is already in progress for this monitor.',
    });

    const resTelegram = await app.inject({ method: 'GET', url: '/test-telegram' });
    expect(resTelegram.statusCode).toBe(400);
    expect(resTelegram.json()).toEqual({
      error: 'TELEGRAM_TEST_FAILED',
      message: 'Bot was blocked by user',
    });

    const resWebhook = await app.inject({ method: 'GET', url: '/test-webhook' });
    expect(resWebhook.statusCode).toBe(400);
    expect(resWebhook.json()).toEqual({
      error: 'WEBHOOK_TEST_FAILED',
      message: 'Endpoint returned 502',
      status: 502,
    });

    const res503 = await app.inject({ method: 'GET', url: '/test-503' });
    expect(res503.statusCode).toBe(503);
    expect(res503.json()).toEqual({
      error: 'REALTIME_UNAVAILABLE',
      message: 'Realtime event stream is temporarily unavailable.',
    });
  });

  it('preserves message and fallbackToPrevious in toRealtimeDto', () => {
    const dto = toRealtimeDto({
      type: 'JOB_COMPILATION_FAILED',
      userId: 'user-1',
      jobId: 'job-1',
      message: 'Setup failed',
      fallbackToPrevious: true,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(dto.message).toBe('Setup failed');
    expect(dto.fallbackToPrevious).toBe(true);
  });

  it('formats unmatched routes into standard 404 NOT_FOUND response via notFoundHandler', async () => {
    const app = Fastify();
    app.setNotFoundHandler(notFoundHandler);

    const res = await app.inject({ method: 'GET', url: '/non-existent-route' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: 'NOT_FOUND',
      message: 'Route GET /non-existent-route not found.',
    });
  });
});
