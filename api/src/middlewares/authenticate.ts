import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../shared/errors/app-error.js';
import { verifyAccessToken } from '../shared/utils/jwt.js';

/**
 * JWT authentication middleware.
 * Attaches req.user on success; rejects missing/invalid tokens.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid Authorization header'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(new UnauthorizedError('Missing access token'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired access token'));
  }
}
