import type { FastifyError, FastifyInstance } from 'fastify';

import { ERROR_CODES, type ApiErrorEnvelope, type ErrorCode } from '@ikp/shared';

import { AppError } from './errors.js';

function envelope(
  code: ErrorCode,
  message: string,
  details: unknown,
  requestId: string,
): ApiErrorEnvelope {
  return { error: { code, message, details, request_id: requestId } };
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      const statusCode = error.statusCode;
      return reply
        .status(statusCode)
        .send(envelope(error.code, error.message, error.details, request.id));
    }

    // Framework-level client errors (empty JSON body, unsupported media type,
    // payload too large, ...) carry a stable status code and must not surface
    // as internal server errors.
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send(envelope(ERROR_CODES.VALIDATION_ERROR, 'Invalid request body.', {}, request.id));
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(500)
      .send(envelope(ERROR_CODES.INTERNAL_ERROR, 'Internal server error.', {}, request.id));
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .send(envelope(ERROR_CODES.NOT_FOUND, 'Route not found.', {}, request.id));
  });
}
