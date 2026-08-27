import { ERROR_CODES, HTTP_STATUS } from '../../constants/index.js';

export interface AppErrorOptions {
  code?: string;
  statusCode?: number;
  details?: unknown;
  isOperational?: boolean;
}

/**
 * Base operational error for the API surface.
 * Controllers never throw raw Error — always AppError subclasses.
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code ?? ERROR_CODES.INTERNAL_ERROR;
    this.statusCode = options.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, {
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: HTTP_STATUS.BAD_REQUEST,
      details,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, {
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: HTTP_STATUS.UNAUTHORIZED,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, {
      code: ERROR_CODES.FORBIDDEN,
      statusCode: HTTP_STATUS.FORBIDDEN,
    });
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor(message = 'Please verify your email before logging in') {
    super(message, {
      code: ERROR_CODES.EMAIL_NOT_VERIFIED,
      statusCode: HTTP_STATUS.FORBIDDEN,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, {
      code: ERROR_CODES.NOT_FOUND,
      statusCode: HTTP_STATUS.NOT_FOUND,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, {
      code: ERROR_CODES.CONFLICT,
      statusCode: HTTP_STATUS.CONFLICT,
    });
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable entity', details?: unknown) {
    super(message, {
      code: ERROR_CODES.UNPROCESSABLE,
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class AiServiceError extends AppError {
  constructor(message = 'AI service unavailable', details?: unknown) {
    super(message, {
      code: ERROR_CODES.AI_SERVICE_ERROR,
      statusCode: HTTP_STATUS.BAD_GATEWAY,
      details,
    });
  }
}
