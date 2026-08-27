import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validateRequest } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ProfileController } from './controllers/profile.controller.js';
import type { IProfileRepository } from './interfaces/profile.repository.interface.js';
import { ProfileService } from './services/profile.service.js';
import { updateProfileSchema } from './validators/profile.validator.js';

export interface ProfileModuleDeps {
  profileRepository: IProfileRepository;
}

export function createProfileModule(deps: ProfileModuleDeps): Router {
  const service = new ProfileService(deps.profileRepository);
  const controller = new ProfileController(service);
  const router = Router();

  router.use(authenticate);
  router.get('/', asyncHandler(controller.get));
  router.put('/', validateRequest(updateProfileSchema), asyncHandler(controller.update));

  return router;
}
