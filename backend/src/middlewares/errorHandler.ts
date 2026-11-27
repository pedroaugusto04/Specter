import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import {
  ConflictError,
  DomainError,
  RealtimeUnavailableError,
  TelegramTestFailedError,
  ValidationError,
  WebhookTestFailedError,
} from '../errors/domainErrors.js';
import { logger } from '../utils/logger.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';

function buildFieldErrorMap(details: Array<{ field: string; message: string }>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const item of details) {
    if (!fields[item.field]) {
      fields[item.field] = item.message;
    }
  }
  return fields;
}

export function centralErrorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): FastifyReply {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      field: issue.path.join('.') || 'root',
      message: issue.message,
    }));
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: details[0]?.message ?? 'Invalid input data.',
      details,
      fields: buildFieldErrorMap(details),
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

  if (error instanceof WebhookTestFailedError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      ...(error.upstreamStatus !== undefined ? { status: error.upstreamStatus } : {}),
    });
  }

  if (
    error instanceof ConflictError ||
    error instanceof TelegramTestFailedError ||
    error instanceof RealtimeUnavailableError
  ) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }

  if (error instanceof DomainError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: formatUserErrorMessage(error),
    });
  }

  const fastifyError = error as Partial<FastifyError> & {
    error?: string;
    retryAfterSeconds?: number;
  };

  if (Array.isArray(fastifyError.validation)) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  if (fastifyError.statusCode === 429 || fastifyError.code === 'FST_ERR_RATE_LIMIT_EXCEEDED') {
    return reply.status(429).send({
      error: fastifyError.error || 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please wait a moment and try again.',
      ...(fastifyError.retryAfterSeconds
        ? { retryAfterSeconds: fastifyError.retryAfterSeconds }
        : {}),
    });
  }

  logger.error('Unhandled API route error', {
    path: request.url,
    method: request.method,
    errorMessage: error.message,
    stack: error.stack,
  });

  const statusCode = fastifyError.statusCode ?? 500;
  return reply.status(statusCode).send({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'We could not complete this request. Please try again later.',
  });
}

export function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): FastifyReply {
  return reply.status(404).send({
    error: 'NOT_FOUND',
    message: `Route ${request.method} ${request.url} not found.`,
  });
}
