import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { ValidationError } from '../shared/errors/app-error.js';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Zod validation middleware factory.
 * Never trust request body — validate at the HTTP boundary.
 */
export function validateRequest<T>(schema: ZodSchema<T>, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[part]);
      req[part] = parsed as never;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ValidationError('Validation failed', {
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          }),
        );
        return;
      }
      next(error);
    }
  };
}
