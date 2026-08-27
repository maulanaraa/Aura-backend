import type { AffiliatorProfile, PrismaClient, Prisma } from '@prisma/client';
import type {
  AffiliatorListFilter,
  AffiliatorProfileDto,
  IAffiliatorRepository,
  UpdateAffiliatorInput,
} from '../interfaces/affiliator.repository.interface.js';

type AffiliatorRow = AffiliatorProfile & {
  user: { email: string; isTwoFactorEnabled: boolean; profile: { name: string | null } | null };
};

const affiliatorInclude = {
  user: { include: { profile: true } },
} as const;

function toSocialPlatforms(value: Prisma.JsonValue): AffiliatorProfileDto['socialPlatforms'] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as AffiliatorProfileDto['socialPlatforms'];
  }
  return {};
}

export class AffiliatorRepository implements IAffiliatorRepository {
  constructor(private readonly db: PrismaClient) {}

  private async mapRow(row: AffiliatorRow): Promise<AffiliatorProfileDto> {
    const [productCount, clickAgg, scanCount] = await Promise.all([
      this.db.affiliatorListing.count({ where: { affiliatorId: row.id } }),
      this.db.affiliatorListing.aggregate({
        where: { affiliatorId: row.id },
        _sum: { clicks: true },
      }),
      this.db.scan.count({ where: { aiPage: { affiliatorId: row.id } } }),
    ]);

    return {
      id: row.id,
      userId: row.userId,
      name: row.user.profile?.name ?? null,
      handle: row.handle,
      email: row.user.email,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      niche: row.niche,
      socialPlatforms: toSocialPlatforms(row.socialPlatforms),
      apiKey: row.apiKey,
      status: row.status,
      tier: row.tier,
      planStatus: row.planStatus,
      monthlyScanUsage: row.monthlyScanUsage,
      monthlyScanLimit: row.monthlyScanLimit,
      notifications: {
        emailDigest: row.notifyEmailDigest,
        conversionAlerts: row.notifyConversionAlerts,
        weeklyReport: row.notifyWeeklyReport,
        newFeatures: row.notifyNewFeatures,
      },
      followersCount: row.followersCount,
      joinedAt: row.joinedAt,
      totalProductsInCatalog: productCount,
      totalScansGenerated: scanCount,
      totalClicksGenerated: clickAgg._sum.clicks ?? 0,
      isTwoFactorEnabled: row.user.isTwoFactorEnabled,
    };
  }

  async findByUserId(userId: string): Promise<AffiliatorProfileDto | null> {
    const row = await this.db.affiliatorProfile.findUnique({
      where: { userId },
      include: affiliatorInclude,
    });
    return row ? this.mapRow(row) : null;
  }

  async findById(id: string): Promise<AffiliatorProfileDto | null> {
    const row = await this.db.affiliatorProfile.findUnique({
      where: { id },
      include: affiliatorInclude,
    });
    return row ? this.mapRow(row) : null;
  }

  async listAll(filter: AffiliatorListFilter = {}): Promise<AffiliatorProfileDto[]> {
    const rows = await this.db.affiliatorProfile.findMany({
      where: {
        status: filter.status,
        tier: filter.tier,
      },
      include: affiliatorInclude,
      orderBy: { joinedAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.mapRow(row)));
  }

  async update(id: string, data: UpdateAffiliatorInput): Promise<AffiliatorProfileDto> {
    const current = await this.db.affiliatorProfile.findUniqueOrThrow({ where: { id } });
    const mergedNotifications = { ...current, ...data.notifications };

    const row = await this.db.affiliatorProfile.update({
      where: { id },
      data: {
        handle: data.handle,
        avatarUrl: data.avatarUrl,
        bio: data.bio,
        niche: data.niche,
        socialPlatforms: data.socialPlatforms as Prisma.InputJsonValue | undefined,
        tier: data.tier,
        planStatus: data.planStatus,
        followersCount: data.followersCount,
        ...(data.notifications
          ? {
              notifyEmailDigest: mergedNotifications.notifyEmailDigest,
              notifyConversionAlerts: mergedNotifications.notifyConversionAlerts,
              notifyWeeklyReport: mergedNotifications.notifyWeeklyReport,
              notifyNewFeatures: mergedNotifications.notifyNewFeatures,
            }
          : {}),
        ...(data.name !== undefined
          ? { user: { update: { profile: { update: { name: data.name } } } } }
          : {}),
      },
      include: affiliatorInclude,
    });
    return this.mapRow(row);
  }

  async updateStatus(id: string, status: AffiliatorProfile['status']): Promise<AffiliatorProfileDto> {
    const row = await this.db.affiliatorProfile.update({
      where: { id },
      data: { status },
      include: affiliatorInclude,
    });
    return this.mapRow(row);
  }

  async regenerateApiKey(id: string, apiKey: string): Promise<AffiliatorProfileDto> {
    const row = await this.db.affiliatorProfile.update({
      where: { id },
      data: { apiKey },
      include: affiliatorInclude,
    });
    return this.mapRow(row);
  }

  async deleteById(id: string): Promise<void> {
    const profile = await this.db.affiliatorProfile.findUnique({ where: { id }, select: { userId: true } });
    if (profile) {
      // Deleting the User cascades to AffiliatorProfile, AIPage, etc.
      await this.db.user.delete({ where: { id: profile.userId } });
    }
  }
}
