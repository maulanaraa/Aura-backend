import type { Prisma, PrismaClient, Recommendation } from '@prisma/client';
import type { ScoredProductMatch } from '../engine/rule-engine.js';

export interface CreateRecommendationData {
  userId: string;
  scanId: string;
  reasons: unknown;
  ingredientIds: string[];
  productMatches: Array<{
    productId: string;
    matchScore: number;
    explanations: string[];
  }>;
}

export interface RecommendationWithRelations extends Recommendation {
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
  products: Array<{
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
  }>;
  scan: {
    skinTone: string;
    undertone: string;
    faceShape: string;
    confidence: number;
  };
}

export interface IRecommendationRepository {
  create(data: CreateRecommendationData): Promise<Recommendation>;
  findLatestByUserId(userId: string): Promise<RecommendationWithRelations | null>;
  deleteByScanId(scanId: string): Promise<void>;
}

export class RecommendationRepository implements IRecommendationRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: CreateRecommendationData): Promise<Recommendation> {
    return this.db.recommendation.create({
      data: {
        userId: data.userId,
        scanId: data.scanId,
        reasons: data.reasons as Prisma.InputJsonValue,
        ingredients: {
          create: data.ingredientIds.map((ingredientId) => ({ ingredientId })),
        },
        products: {
          create: data.productMatches.map((match) => ({
            productId: match.productId,
            matchScore: match.matchScore,
            explanations: match.explanations,
          })),
        },
      },
    });
  }

  async deleteByScanId(scanId: string): Promise<void> {
    await this.db.recommendation.deleteMany({ where: { scanId } });
  }

  findLatestByUserId(userId: string): Promise<RecommendationWithRelations | null> {
    return this.db.recommendation.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        ingredients: { include: { ingredient: true } },
        products: {
          orderBy: { matchScore: 'desc' },
          include: {
            product: {
              include: {
                ingredients: { include: { ingredient: true } },
              },
            },
          },
        },
        scan: {
          select: {
            skinTone: true,
            undertone: true,
            faceShape: true,
            confidence: true,
          },
        },
      },
    }) as Promise<RecommendationWithRelations | null>;
  }
}

export type { ScoredProductMatch };
