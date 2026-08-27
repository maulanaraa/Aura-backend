import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { resolveAffiliatorId } from '../../middlewares/resolve-affiliator.js';
import { validateRequest } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import {
  AIPageController,
  createAIPageSchema,
  updateAIPageSchema,
} from './controllers/ai-page.controller.js';
import type { IAIPageRepository } from './interfaces/ai-page.repository.interface.js';
import { AIPageService } from './services/ai-page.service.js';

export interface AIPageModuleDeps {
  db: PrismaClient;
  aiPageRepository: IAIPageRepository;
}

export function createAIPageModule(deps: AIPageModuleDeps): Router {
  const service = new AIPageService(deps.aiPageRepository);
  const controller = new AIPageController(service);
  const router = Router();

  // Public route — must be registered before the authenticate gate below.
  router.get('/public/:slug', asyncHandler(controller.publicBySlug));

  router.use(authenticate, authorize('AFFILIATOR'), resolveAffiliatorId(deps.db));

  router.get('/', asyncHandler(controller.list));
  router.post('/', validateRequest(createAIPageSchema), asyncHandler(controller.create));
  router.patch('/:id', validateRequest(updateAIPageSchema), asyncHandler(controller.update));
  router.delete('/:id', asyncHandler(controller.delete));

  return router;
}
