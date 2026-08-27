import type { AIPage, PrismaClient } from '@prisma/client';
import type { ListingDto } from '../../listing/interfaces/listing.repository.interface.js';
import type {
  AIPageDto,
  CreateAIPageInput,
  IAIPageRepository,
  PublicAIPageDto,
  UpdateAIPageInput,
} from '../interfaces/ai-page.repository.interface.js';

type AffiliatorBranding = { handle: string; avatarUrl: string | null; user: { profile: { name: string | null } | null } };

type AIPageRow = AIPage & {
  affiliator: AffiliatorBranding;
  featured: { listingId: string }[];
};

function mapListingRow(row: {
  id: string;
  productId: string;
  affiliateUrl: string;
  priceOverride: number | null;
  originalPriceOverride: number | null;
  shadeOverride: string | null;
  status: string;
  matchScoreWeight: number;
  affiliatorNote: string | null;
  clicks: number;
  conversions: number;
  revenueGenerated: number;
  product: {
    name: string;
    brand: string;
    category: string;
    mainCategory: string | null;
    price: number;
    originalPrice: number | null;
    imageUrl: string | null;
    shade: string | null;
    suitableSkinTones: string[];
    suitableUndertones: string[];
    suitableSkinTypes: string[];
    targetsConcerns: string[];
  };
}): ListingDto {
  return {
    id: row.id,
    productId: row.productId,
    name: row.product.name,
    brand: row.product.brand,
    category: row.product.category,
    mainCategory: row.product.mainCategory,
    price: row.priceOverride ?? row.product.price,
    originalPrice: row.originalPriceOverride ?? row.product.originalPrice,
    imageUrl: row.product.imageUrl,
    affiliateUrl: row.affiliateUrl,
    shade: row.shadeOverride ?? row.product.shade,
    suitableSkinTones: row.product.suitableSkinTones,
    suitableUndertones: row.product.suitableUndertones,
    suitableSkinTypes: row.product.suitableSkinTypes,
    targetsConcerns: row.product.targetsConcerns,
    matchScoreWeight: row.matchScoreWeight,
    status: row.status as ListingDto['status'],
    clicks: row.clicks,
    conversions: row.conversions,
    revenueGenerated: row.revenueGenerated,
    affiliatorNote: row.affiliatorNote,
  };
}

const pageInclude = {
  affiliator: { select: { handle: true, avatarUrl: true, user: { select: { profile: { select: { name: true } } } } } },
  featured: { select: { listingId: true }, orderBy: { position: 'asc' as const } },
} as const;

export class AIPageRepository implements IAIPageRepository {
  constructor(private readonly db: PrismaClient) {}

  private async mapRow(row: AIPageRow): Promise<AIPageDto> {
    const [totalViews, totalScans, convertedLeads] = await Promise.all([
      this.db.pageViewEvent.count({ where: { aiPageId: row.id } }),
      this.db.scan.count({ where: { aiPageId: row.id } }),
      this.db.customerLead.count({ where: { aiPageId: row.id, clickedAffiliate: true } }),
    ]);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      creatorName: row.affiliator.user.profile?.name ?? null,
      creatorHandle: row.affiliator.handle,
      avatarUrl: row.affiliator.avatarUrl,
      bio: row.bio,
      primaryColor: row.primaryColor,
      accentColor: row.accentColor,
      welcomeMessage: row.welcomeMessage,
      allowCameraUpload: row.allowCameraUpload,
      featuredProductIds: row.featured.map((f) => f.listingId),
      customDomain: row.customDomain,
      totalViews,
      totalScans,
      conversionRate: totalScans > 0 ? Number(((convertedLeads / totalScans) * 100).toFixed(1)) : 0,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  async findAllForAffiliator(affiliatorId: string): Promise<AIPageDto[]> {
    const rows = await this.db.aIPage.findMany({
      where: { affiliatorId },
      include: pageInclude,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.mapRow(row)));
  }

  async findByIdForAffiliator(id: string, affiliatorId: string): Promise<AIPageDto | null> {
    const row = await this.db.aIPage.findFirst({ where: { id, affiliatorId }, include: pageInclude });
    return row ? this.mapRow(row) : null;
  }

  async findPublicBySlug(slug: string): Promise<PublicAIPageDto | null> {
    let row = await this.db.aIPage.findUnique({
      where: { slug },
      include: {
        ...pageInclude,
        featured: {
          orderBy: { position: 'asc' },
          include: { listing: { include: { product: true } } },
        },
      },
    });

    // Lazy-create default AI Page if missing but the affiliator is active
    if (!row) {
      const affiliator = await this.db.affiliatorProfile.findFirst({
        where: { handle: slug, status: 'APPROVED' },
      });
      if (affiliator) {
        row = await this.db.aIPage.create({
          data: {
            affiliatorId: affiliator.id,
            slug: affiliator.handle,
            title: `${affiliator.handle}'s Beauty AI`,
            bio: affiliator.niche ? `Find your perfect makeup matches for ${affiliator.niche}` : 'Find your perfect shade with my AI skin analyst!',
            primaryColor: '#F26CA7',
            accentColor: '#18181B',
            status: 'PUBLISHED',
            allowCameraUpload: true,
          },
          include: {
            ...pageInclude,
            featured: {
              orderBy: { position: 'asc' },
              include: { listing: { include: { product: true } } },
            },
          },
        });
      }
    }

    if (!row) return null;

    const dto = await this.mapRow(row as unknown as AIPageRow);
    return {
      ...dto,
      affiliatorId: row.affiliatorId,
      featuredListings: row.featured.map((f) => mapListingRow(f.listing)),
    };
  }

  async create(affiliatorId: string, data: CreateAIPageInput): Promise<AIPageDto> {
    const row = await this.db.aIPage.create({
      data: {
        affiliatorId,
        slug: data.slug,
        title: data.title,
        bio: data.bio,
        welcomeMessage: data.welcomeMessage,
        primaryColor: data.primaryColor,
        accentColor: data.accentColor,
        allowCameraUpload: data.allowCameraUpload ?? true,
        customDomain: data.customDomain,
        status: 'PUBLISHED',
        featured: data.featuredListingIds
          ? { create: data.featuredListingIds.map((listingId, position) => ({ listingId, position })) }
          : undefined,
      },
      include: pageInclude,
    });
    return this.mapRow(row);
  }

  async update(id: string, data: UpdateAIPageInput): Promise<AIPageDto> {
    if (data.featuredListingIds) {
      await this.db.aIPageFeaturedListing.deleteMany({ where: { aiPageId: id } });
    }
    const row = await this.db.aIPage.update({
      where: { id },
      data: {
        title: data.title,
        bio: data.bio,
        welcomeMessage: data.welcomeMessage,
        primaryColor: data.primaryColor,
        accentColor: data.accentColor,
        allowCameraUpload: data.allowCameraUpload,
        customDomain: data.customDomain,
        status: data.status,
        featured: data.featuredListingIds
          ? { create: data.featuredListingIds.map((listingId, position) => ({ listingId, position })) }
          : undefined,
      },
      include: pageInclude,
    });
    return this.mapRow(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.aIPage.delete({ where: { id } });
  }

  async recordPageView(aiPageId: string): Promise<void> {
    await this.db.pageViewEvent.create({ data: { aiPageId } });
  }
}
