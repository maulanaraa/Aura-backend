import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
      /** AffiliatorProfile.id for the authenticated AFFILIATOR user — set by resolveAffiliatorId middleware. */
      affiliatorId?: string;
    }
  }
}

export {};
