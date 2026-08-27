import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { resolveAffiliatorId } from '../../middlewares/resolve-affiliator.js';
import { validateRequest } from '../../middlewares/validate.js';
import { handleMulterError, uploadScanImageToMemory } from '../../middlewares/index.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import type { IAiClient } from '../../shared/services/ai-client.js';
import type { IGeminiClient } from '../../shared/services/gemini-client.js';
import type { IStorageService } from '../../shared/services/storage.service.js';
import { LeadController, recordClickSchema } from './controllers/lead.controller.js';
import { LeadService } from './services/lead.service.js';

export interface LeadModuleDeps {
  db: PrismaClient;
  aiClient: IAiClient;
  storageService: IStorageService;
  geminiClient: IGeminiClient;
}

export function createLeadModule(deps: LeadModuleDeps): Router {
  const service = new LeadService(deps.db, deps.aiClient, deps.storageService, deps.geminiClient);
  const controller = new LeadController(service);
  const router = Router();

  router.post(
    '/',
    (req, res, next) => {
      uploadScanImageToMemory(req, res, (err: unknown) => {
        if (err) {
          handleMulterError(err, req, res, next);
          return;
        }
        next();
      });
    },
    asyncHandler(controller.submit),
  );

  router.post('/clicks', validateRequest(recordClickSchema), asyncHandler(controller.recordClick));
  router.patch('/:id', asyncHandler(controller.updateProfile));
  router.post('/profile', asyncHandler(controller.updateProfile));

  router.get(
    '/',
    authenticate,
    authorize('AFFILIATOR'),
    resolveAffiliatorId(deps.db),
    asyncHandler(controller.list),
  );

  return router;
}
