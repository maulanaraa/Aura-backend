import { describe, expect, it } from 'vitest';
import { RecommendationRuleEngine } from '@/modules/recommendation/engine/rule-engine.js';
import { MAKEUP_TYPES } from '@/constants/index.js';
import type { ProductDto } from '@/modules/product/interfaces/product.repository.interface.js';

describe('RecommendationRuleEngine (AURA makeup PRD)', () => {
  const engine = new RecommendationRuleEngine();

  const sampleProduct = (overrides: Partial<ProductDto> = {}): ProductDto => ({
    id: '00000000-0000-0000-0000-000000000001',
    socoId: 'soco-1',
    datasetId: null,
    brand: 'Wardah',
    name: 'Matte Lip Cream',
    slug: 'wardah-matte-lip-cream',
    description: 'Long wear lip cream',
    imageUrl: null,
    category: 'Lips',
    subcategory: 'Lip Cream',
    mainCategory: 'Lips',
    finish: 'matte',
    undertoneMatch: 'warm',
    usage: null,
    benefits: [],
    tags: ['Lips', 'Lip Cream', 'matte', 'warm'],
    rating: 4.5,
    reviewCount: 10000,
    minPrice: 55000,
    maxPrice: 55000,
    price: 55000,
    originalPrice: null,
    shade: null,
    suitableSkinTones: [],
    suitableUndertones: [],
    suitableSkinTypes: [],
    targetsConcerns: [],
    matchScoreWeight: 80,
    sourceUrl: null,
    affiliateUrl: 'https://www.sociolla.com/example',
    isActive: true,
    makeupTypes: [
      {
        id: '1',
        name: MAKEUP_TYPES.LIP_CREAM,
        slug: 'lip-cream',
        description: null,
        benefits: [],
        concerns: [],
      },
    ],
    ...overrides,
  });

  it('suggests foundation and concealer as base types', () => {
    const types = engine.suggestMakeupTypes({
      skinTone: 'Light',
      undertone: 'Warm',
      faceShape: 'Oval',
      confidence: 0.9,
    });
    expect(types).toContain(MAKEUP_TYPES.FOUNDATION);
    expect(types).toContain(MAKEUP_TYPES.CONCEALER);
  });

  it('ranks top products with explainable reasons', () => {
    const ranked = engine.rankProducts(
      [
        sampleProduct(),
        sampleProduct({
          id: '00000000-0000-0000-0000-000000000002',
          brand: 'Other',
          name: 'Random Gel',
          subcategory: 'Nail Polish',
          category: 'Nails',
          minPrice: 900000,
          tags: ['Nails'],
          makeupTypes: [],
          reviewCount: 1,
          rating: 3,
        }),
      ],
      {
        skinTone: 'Light',
        undertone: 'Warm',
        faceShape: 'Oval',
        confidence: 0.9,
      },
      {
        budgetMax: 300_000,
        favoriteBrands: ['Wardah'],
        occasion: 'PARTY',
        finishPreference: 'MATTE',
        preferredCategories: ['Lips'],
      },
      5,
    );

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]?.product.brand).toBe('Wardah');
    expect(ranked[0]?.explanations.some((e) => e.toLowerCase().includes('warm'))).toBe(true);
    expect(ranked[0]?.explanations.some((e) => e.toLowerCase().includes('budget'))).toBe(true);
  });
});
