import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app/create-app.js';
import type { IAiClient } from '@/shared/services/ai-client.js';
import type { AppContainer } from '@/app/container.js';
import type { RecommendationService } from '@/modules/recommendation/services/recommendation.service.js';

/**
 * Lightweight integration smoke tests with stubbed collaborators.
 * Full DB-backed tests require DATABASE_URL + migrations.
 */
describe('HTTP surface (stubbed)', () => {
  const aiClient: IAiClient = {
    predict: vi.fn(async () => ({
      skin_tone: 'Medium' as const,
      undertone: 'Warm' as const,
      face_shape: 'Oval' as const,
      confidence: 0.91,
    })),
  };

  const stubContainer = {
    authRepository: {} as AppContainer['authRepository'],
    userRepository: {} as AppContainer['userRepository'],
    profileRepository: {} as AppContainer['profileRepository'],
    productRepository: {
      findAllActive: vi.fn(async () => []),
      findByIngredientNames: vi.fn(async () => []),
      findByMakeupTypes: vi.fn(async () => []),
      findCandidatesForRecommendation: vi.fn(async () => []),
      findByIds: vi.fn(async () => []),
      listCategories: vi.fn(async () => []),
      listBrands: vi.fn(async () => []),
    },
    ingredientRepository: {
      findAll: vi.fn(async () => []),
      findByNames: vi.fn(async () => []),
    },
    recommendationRepository: {} as AppContainer['recommendationRepository'],
    scanRepository: {} as AppContainer['scanRepository'],
    historyRepository: {} as AppContainer['historyRepository'],
    ruleEngine: {} as AppContainer['ruleEngine'],
    aiClient,
    recommendationService: {} as RecommendationService,
  } as unknown as AppContainer;

  it('GET /health returns envelope', async () => {
    const app = createApp({ container: stubContainer, aiClient });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe('auraai-backend');
  });

  it('GET /products returns catalog envelope', async () => {
    const app = createApp({ container: stubContainer, aiClient });
    const res = await request(app).get('/products');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /unknown returns 404 envelope', async () => {
    const app = createApp({ container: stubContainer, aiClient });
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
