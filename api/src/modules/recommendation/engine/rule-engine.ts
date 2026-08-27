import { MAKEUP_TYPES, TOP_N_RECOMMENDATIONS } from '../../../constants/index.js';
import type { ProductDto } from '../../product/interfaces/product.repository.interface.js';

export interface BeautyAnalysisInput {
  skinTone: string;
  undertone: string;
  faceShape: string;
  confidence: number;
}

export interface BeautyPreferencesInput {
  budgetMax?: number | null;
  favoriteBrands?: string[];
  occasion?: string | null;
  finishPreference?: string | null;
  preferredCategories?: string[];
}

export interface ScoredProductMatch {
  product: ProductDto;
  matchScore: number;
  explanations: string[];
  makeupTypes: string[];
}

/**
 * Rule-based makeup recommender (PRD Features 3–4).
 * Ranks catalog products and returns Top N with explainable reasons.
 */
export class RecommendationRuleEngine {
  /** Makeup types suggested from face traits + occasion. */
  suggestMakeupTypes(
    analysis: BeautyAnalysisInput,
    preferences: BeautyPreferencesInput = {},
  ): string[] {
    const types = new Set<string>();
    const occasion = preferences.occasion?.toUpperCase() ?? 'DAILY';
    const finish = preferences.finishPreference?.toUpperCase() ?? 'NATURAL';

    // Base face makeup always relevant
    types.add(MAKEUP_TYPES.FOUNDATION);
    types.add(MAKEUP_TYPES.CONCEALER);

    if (finish === 'MATTE' || analysis.undertone) {
      types.add(MAKEUP_TYPES.POWDER);
    }
    if (finish === 'DEWY' || finish === 'NATURAL') {
      types.add(MAKEUP_TYPES.CUSHION);
    }

    // Face shape → eye / brow emphasis
    const shape = analysis.faceShape.toLowerCase();
    if (['heart', 'diamond', 'oblong'].includes(shape)) {
      types.add(MAKEUP_TYPES.BROW);
      types.add(MAKEUP_TYPES.EYESHADOW);
    }
    if (['round', 'square'].includes(shape)) {
      types.add(MAKEUP_TYPES.BLUSH);
      types.add(MAKEUP_TYPES.MASCARA);
    }
    if (shape === 'oval') {
      types.add(MAKEUP_TYPES.BLUSH);
      types.add(MAKEUP_TYPES.LIP_TINT);
    }

    // Occasion
    if (occasion === 'PARTY' || occasion === 'WEDDING') {
      types.add(MAKEUP_TYPES.EYESHADOW);
      types.add(MAKEUP_TYPES.LIP_CREAM);
      types.add(MAKEUP_TYPES.MASCARA);
    } else {
      types.add(MAKEUP_TYPES.LIP_TINT);
    }

    // Preferred categories from questionnaire
    for (const cat of preferences.preferredCategories ?? []) {
      const c = cat.toLowerCase();
      if (c === 'lips') {
        types.add(MAKEUP_TYPES.LIP_CREAM);
        types.add(MAKEUP_TYPES.LIP_TINT);
      }
      if (c === 'eyes') {
        types.add(MAKEUP_TYPES.EYESHADOW);
        types.add(MAKEUP_TYPES.MASCARA);
        types.add(MAKEUP_TYPES.BROW);
      }
      if (c === 'cheeks' || c === 'face') {
        types.add(MAKEUP_TYPES.BLUSH);
        types.add(MAKEUP_TYPES.FOUNDATION);
      }
    }

    return [...types];
  }

  /**
   * Score and rank products. Returns Top N with explanations.
   */
  rankProducts(
    products: ProductDto[],
    analysis: BeautyAnalysisInput,
    preferences: BeautyPreferencesInput = {},
    limit = TOP_N_RECOMMENDATIONS,
  ): ScoredProductMatch[] {
    const preferredTypes = new Set(
      this.suggestMakeupTypes(analysis, preferences).map((t) => t.toLowerCase()),
    );
    const favoriteBrands = new Set(
      (preferences.favoriteBrands ?? []).map((b) => b.toLowerCase()),
    );
    const finishPref = preferences.finishPreference?.toLowerCase() ?? null;
    const undertone = analysis.undertone.toLowerCase();
    const budgetMax = preferences.budgetMax ?? null;
    const preferredCats = new Set(
      (preferences.preferredCategories ?? []).map((c) => c.toLowerCase()),
    );
    const occasion = preferences.occasion?.toUpperCase() ?? 'DAILY';

    const scored = products.map((product) => {
      let score = 0;
      const explanations: string[] = [];

      const sub = (product.subcategory ?? '').toLowerCase();
      const tags = product.tags.map((t) => t.toLowerCase());
      const typeNames = product.makeupTypes.map((t) => t.name.toLowerCase());
      const haystack = [sub, ...tags, ...typeNames];

      const matchedTypes = [...preferredTypes].filter((t) =>
        haystack.some((h) => h.includes(t) || t.includes(h)),
      );
      if (matchedTypes.length > 0) {
        score += 35 + matchedTypes.length * 5;
        explanations.push(`Matches makeup type: ${product.subcategory ?? matchedTypes[0]}`);
      }

      // Undertone
      const productUndertone = (product.undertoneMatch ?? '').toLowerCase();
      const undertoneHit =
        productUndertone === undertone ||
        productUndertone === 'universal' ||
        tags.includes(undertone) ||
        tags.includes(`${undertone} undertone`);
      if (undertoneHit || (!productUndertone && matchedTypes.length > 0)) {
        score += 20;
        explanations.push(`${analysis.undertone} undertone`);
      }

      // Finish preference
      const finish = (product.finish ?? '').toLowerCase();
      if (finishPref && (finish === finishPref || tags.includes(finishPref))) {
        score += 15;
        explanations.push(`${preferences.finishPreference} finish`);
      } else if (!finishPref && finish === 'natural') {
        score += 5;
      }

      // Budget
      const price = product.minPrice ?? product.maxPrice;
      if (budgetMax != null && price != null && price <= budgetMax) {
        score += 15;
        explanations.push(`Budget under Rp${budgetMax.toLocaleString('id-ID')}`);
      } else if (budgetMax != null && price == null) {
        score += 5;
      } else if (budgetMax != null && price != null && price > budgetMax) {
        score -= 20;
      }

      // Favorite brands
      if (favoriteBrands.has(product.brand.toLowerCase())) {
        score += 12;
        explanations.push(`Favorite brand: ${product.brand}`);
      }

      // Preferred category
      if (preferredCats.has(product.category.toLowerCase())) {
        score += 10;
        explanations.push(`Preferred category: ${product.category}`);
      }

      // Occasion suitability (soft)
      if (occasion === 'DAILY' || occasion === 'CASUAL' || occasion === 'WORK') {
        if (sub.includes('tint') || sub.includes('cushion') || finish === 'natural') {
          score += 8;
          explanations.push(`Suitable for ${occasion.toLowerCase()} makeup`);
        }
      }
      if (occasion === 'PARTY' || occasion === 'WEDDING') {
        if (sub.includes('palette') || sub.includes('cream') || sub.includes('mascara')) {
          score += 8;
          explanations.push(`Suitable for ${occasion.toLowerCase()}`);
        }
      }

      // Social proof
      score += Math.min(10, (product.reviewCount ?? 0) / 2000);
      if (product.rating != null) score += product.rating;

      // Skin tone mention in tags/benefits
      if (
        tags.some((t) => t.includes(analysis.skinTone.toLowerCase())) ||
        product.benefits.some((b) => b.toLowerCase().includes(analysis.skinTone.toLowerCase()))
      ) {
        score += 8;
        explanations.push(`Works with ${analysis.skinTone} skin tone`);
      }

      // Face shape soft cue
      explanations.push(`Face shape: ${analysis.faceShape}`);

      // Dedupe explanations, keep unique
      const uniqueExplanations = [...new Set(explanations)].slice(0, 5);

      return {
        product,
        matchScore: Math.round(Math.min(99, Math.max(0, score)) * 10) / 10,
        explanations: uniqueExplanations,
        makeupTypes: matchedTypes,
      };
    });

    return scored
      .filter((s) => s.matchScore > 15)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }
}
