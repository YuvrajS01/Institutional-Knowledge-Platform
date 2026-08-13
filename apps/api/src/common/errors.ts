import { ERROR_CODES, type ErrorCode } from '@ikp/shared';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly statusCode: number = 500,
    readonly details: unknown = {},
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message = 'Resource not found.'): AppError {
    return new AppError(ERROR_CODES.NOT_FOUND, message, 404);
  }

  static internal(message = 'Internal server error.'): AppError {
    return new AppError(ERROR_CODES.INTERNAL_ERROR, message, 500);
  }

  static serviceUnavailable(message = 'Service is temporarily unavailable.'): AppError {
    return new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, message, 503);
  }
}
