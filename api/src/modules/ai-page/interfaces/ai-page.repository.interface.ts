import type { PageStatus } from '@prisma/client';
import type { ListingDto } from '../../listing/interfaces/listing.repository.interface.js';

export interface AIPageDto {
  id: string;
  slug: string;
  title: string;
  creatorName: string | null;
  creatorHandle: string;
  avatarUrl: string | null;
  bio: string | null;
  primaryColor: string;
  accentColor: string;
  welcomeMessage: string | null;
  allowCameraUpload: boolean;
  featuredProductIds: string[];
  customDomain: string | null;
  totalViews: number;
  totalScans: number;
  conversionRate: number;
  status: PageStatus;
  createdAt: Date;
}

export interface PublicAIPageDto extends AIPageDto {
  affiliatorId: string;
  featuredListings: ListingDto[];
}

export interface CreateAIPageInput {
  slug: string;
  title: string;
  bio?: string;
  welcomeMessage?: string;
  primaryColor: string;
  accentColor: string;
  allowCameraUpload?: boolean;
  customDomain?: string;
  featuredListingIds?: string[];
}

export interface UpdateAIPageInput {
  title?: string;
  bio?: string;
  welcomeMessage?: string;
  primaryColor?: string;
  accentColor?: string;
  allowCameraUpload?: boolean;
  customDomain?: string;
  status?: PageStatus;
  featuredListingIds?: string[];
}

export interface IAIPageRepository {
  findAllForAffiliator(affiliatorId: string): Promise<AIPageDto[]>;
  findByIdForAffiliator(id: string, affiliatorId: string): Promise<AIPageDto | null>;
  findPublicBySlug(slug: string): Promise<PublicAIPageDto | null>;
  create(affiliatorId: string, data: CreateAIPageInput): Promise<AIPageDto>;
  update(id: string, data: UpdateAIPageInput): Promise<AIPageDto>;
  delete(id: string): Promise<void>;
  recordPageView(aiPageId: string): Promise<void>;
}
