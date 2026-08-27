import { Router } from 'express';
import type { AppContainer } from './container.js';
import { createAuthModule } from '../modules/auth/index.js';
import { createUserModule } from '../modules/user/index.js';
import { createProfileModule } from '../modules/profile/index.js';
import { createProductModule } from '../modules/product/index.js';
import { createIngredientModule } from '../modules/ingredient/index.js';
import { createRecommendationModule } from '../modules/recommendation/index.js';
import { createScanModule } from '../modules/scan/index.js';
import { createHistoryModule } from '../modules/history/index.js';
import { createHealthModule } from '../modules/health/index.js';
import { createAffiliatorModule } from '../modules/affiliator/index.js';
import { createAIPageModule } from '../modules/ai-page/index.js';
import { createListingModule } from '../modules/listing/index.js';
import { createLeadModule } from '../modules/lead/index.js';
import { createAnalyticsModule } from '../modules/analytics/index.js';
import { createSubscriptionModule } from '../modules/subscription/index.js';

export function createApiRouter(container: AppContainer): Router {
  const router = Router();

  router.use(
    '/auth',
    createAuthModule({ authRepository: container.authRepository, emailService: container.emailService }),
  );
  router.use('/users', createUserModule({ userRepository: container.userRepository }));
  router.use('/profile', createProfileModule({ profileRepository: container.profileRepository }));
  router.use(
    '/products',
    createProductModule({ productRepository: container.productRepository }),
  );
  router.use(
    '/ingredients',
    createIngredientModule({ ingredientRepository: container.ingredientRepository }),
  );
  router.use(
    '/recommendation',
    createRecommendationModule({
      recommendationRepository: container.recommendationRepository,
      ingredientRepository: container.ingredientRepository,
      productRepository: container.productRepository,
      scanRepository: container.scanRepository,
      profileService: container.profileService,
      ruleEngine: container.ruleEngine,
    }),
  );
  router.use(
    '/scan',
    createScanModule({
      aiClient: container.aiClient,
      scanRepository: container.scanRepository,
      historyRepository: container.historyRepository,
      recommendationService: container.recommendationService,
      preferenceReader: container.profileService,
    }),
  );
  router.use(
    '/scan/history',
    createHistoryModule({ historyRepository: container.historyRepository }),
  );
  router.use(
    '/affiliators',
    createAffiliatorModule({
      affiliatorRepository: container.affiliatorRepository,
      storageService: container.storageService,
    }),
  );
  router.use(
    '/ai-pages',
    createAIPageModule({ db: container.db, aiPageRepository: container.aiPageRepository }),
  );
  router.use(
    '/listings',
    createListingModule({ db: container.db, listingRepository: container.listingRepository }),
  );
  router.use(
    '/leads',
    createLeadModule({
      db: container.db,
      aiClient: container.aiClient,
      storageService: container.storageService,
      geminiClient: container.geminiClient,
    }),
  );
  router.use('/subscriptions', createSubscriptionModule({ db: container.db }));
  router.use('/analytics', createAnalyticsModule(container.db));
  router.use('/health', createHealthModule({ aiClient: container.aiClient }));

  return router;
}
