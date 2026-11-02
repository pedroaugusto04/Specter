import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError, ValidationError } from '../errors/domainErrors.js';
import { logger } from '../utils/logger.js';

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
      message: error.message,
    });
  }

  // Fastify schema validation error (if using fastify internal schemas)
  if ('validation' in error && Array.isArray((error as any).validation)) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  logger.error('Unhandled API route error', {
    path: request.url,
    method: request.method,
    errorMessage: error.message,
    stack: error.stack,
  });

  const statusCode = (error as FastifyError).statusCode ?? 500;
  return reply.status(statusCode).send({
    error: 'INTERNAL_SERVER_ERROR',
    message: statusCode === 500 ? 'Internal server error.' : error.message,
  });
}
