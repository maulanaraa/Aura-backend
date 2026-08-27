import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppError } from '../shared/errors/app-error.js';
import { ERROR_CODES, HTTP_STATUS } from '../constants/index.js';
import { logger } from '../shared/utils/logger.js';
import { appConfig } from '../config/index.js';
import type { ApiErrorBody } from '../shared/utils/api-response.js';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    new AppError(`Route ${req.method} ${req.originalUrl} not found`, {
      code: ERROR_CODES.NOT_FOUND,
      statusCode: HTTP_STATUS.NOT_FOUND,
    }),
  );
}

/**
 * Global exception handler — single place for consistent error envelopes.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const code = isAppError ? err.code : ERROR_CODES.INTERNAL_ERROR;
  const message = isAppError
    ? err.message
    : appConfig.isProduction
      ? 'Internal server error'
      : err instanceof Error
        ? err.message
        : 'Internal server error';

  const logPayload = {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code,
    message,
    stack: err instanceof Error && statusCode >= 500 ? err.stack : undefined,
    details: isAppError ? err.details : undefined,
  };

  if (statusCode >= 500) {
    logger.error('Request failed', logPayload);
  } else {
    logger.warn('Request rejected', logPayload);
  }

  const body: ApiErrorBody = {
    success: false,
    error: {
      code,
      message,
      ...(isAppError && err.details !== undefined ? { details: err.details } : {}),
    },
  };

  res.status(statusCode).json(body);
}
