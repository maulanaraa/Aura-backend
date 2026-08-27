import type { AffiliatorStatus, AffiliatorTier, PlanStatus } from '@prisma/client';

export interface AffiliatorProfileDto {
  id: string;
  userId: string;
  name: string | null;
  handle: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  niche: string | null;
  socialPlatforms: { tiktok?: string; instagram?: string; youtube?: string; ltk?: string };
  apiKey: string;
  status: AffiliatorStatus;
  tier: AffiliatorTier;
  planStatus: PlanStatus;
  monthlyScanUsage: number;
  monthlyScanLimit: number;
  notifications: {
    emailDigest: boolean;
    conversionAlerts: boolean;
    weeklyReport: boolean;
    newFeatures: boolean;
  };
  followersCount: string;
  joinedAt: Date;
  totalProductsInCatalog: number;
  totalScansGenerated: number;
  totalClicksGenerated: number;
  isTwoFactorEnabled: boolean;
}

export interface AffiliatorListFilter {
  status?: AffiliatorStatus;
  tier?: AffiliatorTier;
}

export interface UpdateAffiliatorInput {
  name?: string;
  handle?: string;
  avatarUrl?: string;
  bio?: string;
  niche?: string;
  socialPlatforms?: AffiliatorProfileDto['socialPlatforms'];
  tier?: AffiliatorTier;
  planStatus?: PlanStatus;
  followersCount?: string;
  notifications?: Partial<AffiliatorProfileDto['notifications']>;
}

export interface IAffiliatorRepository {
  findByUserId(userId: string): Promise<AffiliatorProfileDto | null>;
  findById(id: string): Promise<AffiliatorProfileDto | null>;
  listAll(filter?: AffiliatorListFilter): Promise<AffiliatorProfileDto[]>;
  update(id: string, data: UpdateAffiliatorInput): Promise<AffiliatorProfileDto>;
  updateStatus(id: string, status: AffiliatorStatus): Promise<AffiliatorProfileDto>;
  regenerateApiKey(id: string, apiKey: string): Promise<AffiliatorProfileDto>;
  deleteById(id: string): Promise<void>;
}
