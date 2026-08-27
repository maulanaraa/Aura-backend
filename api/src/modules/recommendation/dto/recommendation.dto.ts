import type {
  MakeupTypeDto,
  ProductDto,
} from '../../product/interfaces/product.repository.interface.js';
import type { ScoredProductMatch } from '../engine/rule-engine.js';

export interface AnalysisDto {
  skinTone: string;
  undertone: string;
  faceShape: string;
  confidence: number;
}

export interface RankedProductDto extends ProductDto {
  matchScore: number;
  explanations: string[];
}

export interface RecommendationPayloadDto {
  makeupTypes: MakeupTypeDto[];
  products: RankedProductDto[];
  reasons: ScoredProductMatch[];
}

export interface ScanResponseDto {
  analysis: AnalysisDto;
  scanId: string;
  recommendation?: {
    makeupTypes: MakeupTypeDto[];
    products: RankedProductDto[];
  };
  recommendationId?: string;
}

export interface LatestRecommendationDto {
  id: string;
  scanId: string;
  analysis: AnalysisDto;
  makeupTypes: MakeupTypeDto[];
  products: RankedProductDto[];
  createdAt: string;
}
