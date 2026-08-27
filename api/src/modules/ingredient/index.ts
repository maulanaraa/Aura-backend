import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { IngredientController } from './controllers/ingredient.controller.js';
import type { IIngredientRepository } from '../product/interfaces/product.repository.interface.js';
import { IngredientService } from './services/ingredient.service.js';

export interface IngredientModuleDeps {
  ingredientRepository: IIngredientRepository;
}

export function createIngredientModule(deps: IngredientModuleDeps): Router {
  const service = new IngredientService(deps.ingredientRepository);
  const controller = new IngredientController(service);
  const router = Router();
  router.get('/', asyncHandler(controller.list));
  return router;
}
