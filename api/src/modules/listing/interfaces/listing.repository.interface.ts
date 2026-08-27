import type { ListingStatus } from '@prisma/client';

/** Frontend flat `Product` shape = master Product fields merged with the affiliator's own AffiliatorListing overrides. */
export interface ListingDto {
  id: string;
  productId: string;
  name: string;
  brand: string;
  category: string;
  mainCategory: string | null;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  affiliateUrl: string;
  shade: string | null;
  suitableSkinTones: string[];
  suitableUndertones: string[];
  suitableSkinTypes: string[];
  targetsConcerns: string[];
  matchScoreWeight: number;
  status: ListingStatus;
  clicks: number;
  conversions: number;
  revenueGenerated: number;
  affiliatorNote?: string | null;
  subcategory?: string | null;
  finish?: string | null;
  benefits?: string[];
  shopeeUrl?: string | null;
  tiktokUrl?: string | null;
  tokopediaUrl?: string | null;
  sociollaUrl?: string | null;
}

export interface CreateListingInput {
  productId: string;
  affiliateUrl: string;
  priceOverride?: number;
  shadeOverride?: string;
  matchScoreWeight?: number;
  affiliatorNote?: string;
}

export interface UpdateListingInput {
  affiliateUrl?: string;
  priceOverride?: number;
  shadeOverride?: string;
  status?: ListingStatus;
  matchScoreWeight?: number;
  affiliatorNote?: string;
}

export interface IListingRepository {
  findAllForAffiliator(affiliatorId: string): Promise<ListingDto[]>;
  findByIdForAffiliator(id: string, affiliatorId: string): Promise<ListingDto | null>;
  create(affiliatorId: string, data: CreateListingInput): Promise<ListingDto>;
  createMany(affiliatorId: string, productIds: string[]): Promise<ListingDto[]>;
  update(id: string, data: UpdateListingInput): Promise<ListingDto>;
  delete(id: string): Promise<void>;
  incrementClick(id: string, converted: boolean, revenue: number): Promise<void>;
}
