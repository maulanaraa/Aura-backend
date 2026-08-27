import type { ListingDto } from '../../listing/interfaces/listing.repository.interface.js';
import type { ColorSwatch } from '../../recommendation/engine/color-palette.js';
import type { PersonalColor } from '../../recommendation/engine/dataset-rule-engine.js';

export interface SubmitLeadInput {
  slug: string;
  imageBuffer: Buffer;
  mimetype: string;
  followerName?: string;
  followerHandle?: string;
  email?: string;
  location?: string;
  skinPref?: string;
  finishPref?: string;
  budgetPref?: string;
}

export interface RecommendedListingDto {
  product: ListingDto;
  matchScore: number;
  recommendedShade?: string;
  shadeHex?: string;
  shadeRationale?: string;
  isCreatorTopPick?: boolean;
  alternatives?: Array<{
    shadeName: string;
    shadeHex: string;
    description: string;
  }>;
  aiReason: string;
}

export interface LeadScanResultDto {
  leadId: string;
  scanId: string;
  confidence: number;
  personalColor: PersonalColor;
  undertone: string;
  skinTone: string;
  faceShape: string;
  bestColorPalette: ColorSwatch[];
  recommendedProducts: RecommendedListingDto[];
  matchSummary: string | null;
}

export interface CustomerLeadDto {
  id: string;
  scanDate: string;
  followerName: string | null;
  followerHandle: string | null;
  email: string | null;
  age?: number | null;
  selfieUrl: string | null;
  detectedSkinTone: string;
  detectedUndertone: string;
  personalColor: string | null;
  confidence: number;
  faceShape: string;
  bestColorPalette: ColorSwatch[];
  matchSummary: string | null;
  matchedProductCount: number;
  topMatchedProduct: string | null;
  clickedAffiliate: boolean;
  estimatedCommission: number;
  location: string | null;
}
