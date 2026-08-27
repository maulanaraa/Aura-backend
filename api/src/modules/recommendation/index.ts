import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validateRequest } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { RecommendationController } from './controllers/recommendation.controller.js';
import { RecommendationRuleEngine } from './engine/rule-engine.js';
import type {
  IIngredientRepository,
  IProductRepository,
} from '../product/interfaces/product.repository.interface.js';
import type { IRecommendationRepository } from './repositories/recommendation.repository.js';
import { RecommendationService } from './services/recommendation.service.js';
import type { IScanRepository } from '../scan/repositories/scan.repository.js';
import type { ProfileService } from '../profile/services/profile.service.js';
import { generateRecommendationSchema } from '../profile/validators/profile.validator.js';

export interface RecommendationModuleDeps {
  recommendationRepository: IRecommendationRepository;
  ingredientRepository: IIngredientRepository;
  productRepository: IProductRepository;
  scanRepository: IScanRepository;
  profileService: ProfileService;
  ruleEngine?: RecommendationRuleEngine;
}

export function createRecommendationService(
  deps: Pick<
    RecommendationModuleDeps,
    'recommendationRepository' | 'ingredientRepository' | 'productRepository' | 'ruleEngine'
  >,
): RecommendationService {
  return new RecommendationService(
    deps.ruleEngine ?? new RecommendationRuleEngine(),
    deps.recommendationRepository,
    deps.ingredientRepository,
    deps.productRepository,
  );
}

export function createRecommendationModule(deps: RecommendationModuleDeps): Router {
  const service = createRecommendationService(deps);
  const controller = new RecommendationController(
    service,
    deps.scanRepository,
    deps.profileService,
  );
  const router = Router();

  router.get('/latest', authenticate, asyncHandler(controller.latest));
  router.post(
    '/generate',
    authenticate,
    validateRequest(generateRecommendationSchema),
    asyncHandler(controller.generate),
  );
  return router;
}
