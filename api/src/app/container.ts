import type { PrismaClient } from '@prisma/client';
import { appConfig } from '../config/index.js';
import { AiClient, type IAiClient } from '../shared/services/ai-client.js';
import { GeminiClient, type IGeminiClient } from '../shared/services/gemini-client.js';
import type { IStorageService } from '../shared/services/storage.service.js';
import { SupabaseStorageService } from '../shared/services/supabase-storage.service.js';
import { LocalStorageService } from '../shared/services/local-storage.service.js';
import type { IEmailService } from '../shared/services/email.service.js';
import { ResendEmailService, ConsoleEmailService } from '../shared/services/email.service.js';
import { AuthRepository } from '../modules/auth/repositories/auth.repository.js';
import { UserRepository } from '../modules/user/repositories/user.repository.js';
import { ProfileRepository } from '../modules/profile/repositories/profile.repository.js';
import { ProfileService } from '../modules/profile/services/profile.service.js';
import { ProductRepository } from '../modules/product/repositories/product.repository.js';
import { IngredientRepository } from '../modules/ingredient/repositories/ingredient.repository.js';
import { RecommendationRepository } from '../modules/recommendation/repositories/recommendation.repository.js';
import { RecommendationRuleEngine } from '../modules/recommendation/engine/rule-engine.js';
import {
  HistoryRepository,
  ScanRepository,
} from '../modules/scan/repositories/scan.repository.js';
import { createRecommendationService } from '../modules/recommendation/index.js';
import type { RecommendationService } from '../modules/recommendation/services/recommendation.service.js';
import { AffiliatorRepository } from '../modules/affiliator/repositories/affiliator.repository.js';
import { AIPageRepository } from '../modules/ai-page/repositories/ai-page.repository.js';
import { ListingRepository } from '../modules/listing/repositories/listing.repository.js';

export interface AppContainer {
  db: PrismaClient;
  authRepository: AuthRepository;
  userRepository: UserRepository;
  profileRepository: ProfileRepository;
  profileService: ProfileService;
  productRepository: ProductRepository;
  ingredientRepository: IngredientRepository;
  recommendationRepository: RecommendationRepository;
  scanRepository: ScanRepository;
  historyRepository: HistoryRepository;
  ruleEngine: RecommendationRuleEngine;
  aiClient: IAiClient;
  geminiClient: IGeminiClient;
  recommendationService: RecommendationService;
  affiliatorRepository: AffiliatorRepository;
  aiPageRepository: AIPageRepository;
  listingRepository: ListingRepository;
  storageService: IStorageService;
  emailService: IEmailService;
}

/**
 * Picks Supabase Storage when both Supabase credentials are configured,
 * otherwise falls back to local disk (dev/CI/tests). Callers only ever see
 * `IStorageService` — see shared/services/storage.service.ts.
 */
function createStorageService(): IStorageService {
  if (appConfig.supabase.isConfigured) {
    return new SupabaseStorageService(
      appConfig.supabase.url as string,
      appConfig.supabase.serviceRoleKey as string,
      appConfig.supabase.storageBucket,
    );
  }
  return new LocalStorageService(appConfig.upload.dir, appConfig.upload.publicBaseUrl);
}

/**
 * Picks the Resend API email sender when configured, otherwise
 * falls back to logging the verification link (dev/CI). See
 * shared/services/email.service.ts.
 */
function createEmailService(): IEmailService {
  if (appConfig.email.isConfigured) {
    // Reusing the existing functionSecret config as the Resend API Key to avoid changing environment variables
    return new ResendEmailService(
      appConfig.email.functionSecret as string,
      appConfig.email.fromAddress as string,
    );
  }
  return new ConsoleEmailService();
}

export function createContainer(
  db: PrismaClient,
  aiClient?: IAiClient,
  storageService?: IStorageService,
  emailService?: IEmailService,
): AppContainer {
  const ingredientRepository = new IngredientRepository(db);
  const productRepository = new ProductRepository(db);
  const recommendationRepository = new RecommendationRepository(db);
  const ruleEngine = new RecommendationRuleEngine();
  const profileRepository = new ProfileRepository(db);
  const profileService = new ProfileService(profileRepository);

  const recommendationService = createRecommendationService({
    recommendationRepository,
    ingredientRepository,
    productRepository,
    ruleEngine,
  });

  return {
    db,
    authRepository: new AuthRepository(db),
    userRepository: new UserRepository(db),
    profileRepository,
    profileService,
    productRepository,
    ingredientRepository,
    recommendationRepository,
    scanRepository: new ScanRepository(db),
    historyRepository: new HistoryRepository(db),
    ruleEngine,
    aiClient: aiClient ?? new AiClient(),
    geminiClient: new GeminiClient(),
    recommendationService,
    affiliatorRepository: new AffiliatorRepository(db),
    aiPageRepository: new AIPageRepository(db),
    listingRepository: new ListingRepository(db),
    storageService: storageService ?? createStorageService(),
    emailService: emailService ?? createEmailService(),
  };
}
