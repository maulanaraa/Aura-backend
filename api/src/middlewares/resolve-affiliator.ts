import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { NotFoundError, UnauthorizedError } from '../shared/errors/app-error.js';

/**
 * Resolves req.user.id (User.id) -> req.affiliatorId (AffiliatorProfile.id).
 * Must run after authenticate + authorize('AFFILIATOR').
 */
export function resolveAffiliatorId(db: PrismaClient) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    try {
      const profile = await db.affiliatorProfile.findUnique({
        where: { userId: req.user.id },
        select: { id: true },
      });
      if (!profile) {
        next(new NotFoundError('Affiliator profile not found'));
        return;
      }
      req.affiliatorId = profile.id;
      next();
    } catch (error) {
      next(error);
    }
  };
}
