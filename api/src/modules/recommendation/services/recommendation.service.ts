import type {
  IIngredientRepository,
  IProductRepository,
  ProductDto,
} from '../../product/interfaces/product.repository.interface.js';
import type { BeautyAnalysisInput, BeautyPreferencesInput } from '../engine/rule-engine.js';
import { RecommendationRuleEngine } from '../engine/rule-engine.js';
import type {
  LatestRecommendationDto,
  RankedProductDto,
  RecommendationPayloadDto,
} from '../dto/recommendation.dto.js';
import type { IRecommendationRepository } from '../repositories/recommendation.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { TOP_N_RECOMMENDATIONS } from '../../../constants/index.js';

function toRanked(product: ProductDto, matchScore: number, explanations: string[]): RankedProductDto {
  return { ...product, matchScore, explanations };
}

function mapLinkedProduct(link: {
  matchScore: number;
  explanations: string[];
  product: {
    id: string;
    socoId: string | null;
    datasetId: string | null;
    brand: string;
    name: string;
    slug: string;
    description: string;
    imageUrl: string | null;
    category: string;
    subcategory: string | null;
    mainCategory: string | null;
    finish: string | null;
    undertoneMatch: string | null;
    usage: string | null;
    benefits: string[];
    tags: string[];
    rating: number | null;
    reviewCount: number;
    minPrice: number | null;
    maxPrice: number | null;
    price: number;
    originalPrice: number | null;
    shade: string | null;
    suitableSkinTones: string[];
    suitableUndertones: string[];
    suitableSkinTypes: string[];
    targetsConcerns: string[];
    matchScoreWeight: number;
    sourceUrl: string | null;
    affiliateUrl: string | null;
    isActive: boolean;
    ingredients: Array<{
      ingredient: {
        id: string;
        name: string;
        slug: string;
        description: string | null;
        benefits: string[];
        concerns: string[];
      };
    }>;
  };
}): RankedProductDto {
  const p = link.product;
  return {
    id: p.id,
    socoId: p.socoId,
    datasetId: p.datasetId,
    brand: p.brand,
    name: p.name,
    slug: p.slug,
    description: p.description,
    imageUrl: p.imageUrl,
    category: p.category,
    subcategory: p.subcategory,
    mainCategory: p.mainCategory,
    finish: p.finish,
    undertoneMatch: p.undertoneMatch,
    usage: p.usage,
    benefits: p.benefits,
    tags: p.tags,
    rating: p.rating,
    reviewCount: p.reviewCount,
    minPrice: p.minPrice,
    maxPrice: p.maxPrice,
    price: p.price,
    originalPrice: p.originalPrice,
    shade: p.shade,
    suitableSkinTones: p.suitableSkinTones,
    suitableUndertones: p.suitableUndertones,
    suitableSkinTypes: p.suitableSkinTypes,
    targetsConcerns: p.targetsConcerns,
    matchScoreWeight: p.matchScoreWeight,
    sourceUrl: p.sourceUrl,
    affiliateUrl: p.affiliateUrl,
    isActive: p.isActive,
    makeupTypes: p.ingredients.map((pi) => ({
      id: pi.ingredient.id,
      name: pi.ingredient.name,
      slug: pi.ingredient.slug,
      description: pi.ingredient.description,
      benefits: pi.ingredient.benefits,
      concerns: pi.ingredient.concerns,
    })),
    matchScore: link.matchScore,
    explanations: link.explanations,
  };
}

export class RecommendationService {
  constructor(
    private readonly ruleEngine: RecommendationRuleEngine,
    private readonly recommendationRepository: IRecommendationRepository,
    private readonly ingredientRepository: IIngredientRepository,
    private readonly productRepository: IProductRepository,
  ) {}

  async generateAndPersist(
    userId: string,
    scanId: string,
    analysis: BeautyAnalysisInput,
    preferences: BeautyPreferencesInput = {},
  ): Promise<RecommendationPayloadDto & { recommendationId: string }> {
    await this.recommendationRepository.deleteByScanId(scanId);

    const makeupTypeNames = this.ruleEngine.suggestMakeupTypes(analysis, preferences);
    const [makeupTypes, candidates] = await Promise.all([
      this.ingredientRepository.findByNames(makeupTypeNames),
      this.productRepository.findByMakeupTypes(makeupTypeNames, 80),
    ]);

    const ranked = this.ruleEngine.rankProducts(
      candidates,
      analysis,
      preferences,
      TOP_N_RECOMMENDATIONS,
    );

    const created = await this.recommendationRepository.create({
      userId,
      scanId,
      reasons: {
        analysis,
        preferences,
        makeupTypeNames,
        matches: ranked.map((m) => ({
          productId: m.product.id,
          matchScore: m.matchScore,
          explanations: m.explanations,
        })),
      },
      ingredientIds: makeupTypes.map((i) => i.id),
      productMatches: ranked.map((m) => ({
        productId: m.product.id,
        matchScore: m.matchScore,
        explanations: m.explanations,
      })),
    });

    return {
      recommendationId: created.id,
      makeupTypes,
      products: ranked.map((m) => toRanked(m.product, m.matchScore, m.explanations)),
      reasons: ranked,
    };
  }

  async getLatest(userId: string): Promise<LatestRecommendationDto> {
    const latest = await this.recommendationRepository.findLatestByUserId(userId);
    if (!latest) {
      throw new NotFoundError('No recommendations found');
    }

    return {
      id: latest.id,
      scanId: latest.scanId,
      analysis: {
        skinTone: latest.scan.skinTone,
        undertone: latest.scan.undertone,
        faceShape: latest.scan.faceShape,
        confidence: latest.scan.confidence,
      },
      makeupTypes: latest.ingredients.map((link) => ({
        id: link.ingredient.id,
        name: link.ingredient.name,
        slug: link.ingredient.slug,
        description: link.ingredient.description,
        benefits: link.ingredient.benefits,
        concerns: link.ingredient.concerns,
      })),
      products: latest.products.map(mapLinkedProduct),
      createdAt: latest.createdAt.toISOString(),
    };
  }
}
