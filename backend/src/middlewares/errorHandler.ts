import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError, ValidationError } from '../errors/domainErrors.js';
import { logger } from '../utils/logger.js';
import { formatUserErrorMessage } from '../utils/errorSanitizer.js';

export function centralErrorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): FastifyReply {
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
      message: formatUserErrorMessage(error),
    });
  }

  const fastifyError = error as Partial<FastifyError> & {
    error?: string;
    retryAfterSeconds?: number;
  };

  // Fastify schema validation error (if using fastify internal schemas)
  if (Array.isArray(fastifyError.validation)) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  // Rate-limit error (HTTP 429)
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
