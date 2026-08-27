import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { UserController } from './controllers/user.controller.js';
import type { IUserRepository } from './interfaces/user.repository.interface.js';
import { UserService } from './services/user.service.js';

export interface UserModuleDeps {
  userRepository: IUserRepository;
}

export function createUserModule(deps: UserModuleDeps): Router {
  const service = new UserService(deps.userRepository);
  const controller = new UserController(service);
  const router = Router();

  router.get('/me', authenticate, asyncHandler(controller.me));
  return router;
}
