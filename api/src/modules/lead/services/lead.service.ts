import type { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import type { IAiClient } from '../../../shared/services/ai-client.js';
import type { IGeminiClient } from '../../../shared/services/gemini-client.js';
import type { IStorageService } from '../../../shared/services/storage.service.js';
import { logger } from '../../../shared/utils/logger.js';
import type { ListingDto } from '../../listing/interfaces/listing.repository.interface.js';
import { resolveColorPalette, type ColorSwatch } from '../../recommendation/engine/color-palette.js';
import { resolveExactShade } from '../../recommendation/engine/shade-matcher-engine.js';
import {
  derivePersonalColor,
  normalizeSkinTone,
  normalizeUndertone,
  parseBudgetRangeIDR,
  rankListingsFromDataset,
  type PriceRange,
} from '../../recommendation/engine/dataset-rule-engine.js';
import type {
  CustomerLeadDto,
  LeadScanResultDto,
  RecommendedListingDto,
  SubmitLeadInput,
} from '../interfaces/lead.repository.interface.js';

const TOP_N = 20;

/**
 * The AI service returns confidence as a 0-1 fraction (see aiPredictionSchema).
 * The frontend renders it directly as a percentage string
 * (`${scanResult.confidence.toFixed(1)}%` in PublicAIExperience.tsx), so it
 * must be scaled here — the single boundary between "AI service contract"
 * and "frontend contract" — rather than at every call site.
 */
function toConfidencePercent(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

type ListingWithProduct = Prisma.AffiliatorListingGetPayload<{ include: { product: true } }>;

function toListingDto(row: ListingWithProduct): ListingDto {
  const query = encodeURIComponent(`${row.product.brand} ${row.product.name}`);
  const shopeeUrl = `https://shopee.co.id/search?keyword=${query}`;
  const tiktokUrl = `https://www.tiktok.com/search?q=${query}`;
  const tokopediaUrl = `https://www.tokopedia.com/search?st=product&q=${query}`;
  const sociollaUrl = row.affiliateUrl || row.product.sourceUrl || `https://review.soco.id`;

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
    shopeeUrl,
    tiktokUrl,
    tokopediaUrl,
    sociollaUrl,
    shade: row.shadeOverride ?? row.product.shade,
    suitableSkinTones: row.product.suitableSkinTones,
    suitableUndertones: row.product.suitableUndertones,
    suitableSkinTypes: row.product.suitableSkinTypes,
    targetsConcerns: row.product.targetsConcerns,
    matchScoreWeight: row.matchScoreWeight,
    status: row.status,
    clicks: row.clicks,
    conversions: row.conversions,
    revenueGenerated: row.revenueGenerated,
    affiliatorNote: row.affiliatorNote,
    subcategory: row.product.subcategory,
    finish: row.product.finish,
    benefits: row.product.benefits,
  };
}

export class LeadService {
  constructor(
    private readonly db: PrismaClient,
    private readonly aiClient: IAiClient,
    private readonly storageService: IStorageService,
    private readonly geminiClient: IGeminiClient,
  ) {}

  async submitPublicScan(input: SubmitLeadInput): Promise<LeadScanResultDto> {
    let page = await this.db.aIPage.findUnique({ where: { slug: input.slug } });
    if (!page) {
      const affiliator = await this.db.affiliatorProfile.findFirst({
        where: { handle: input.slug, status: 'APPROVED' },
      });
      if (!affiliator) {
        throw new NotFoundError('Page not found');
      }
      page = await this.db.aIPage.create({
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
      });
    }

    // Persist the selfie and run inference in parallel — independent I/O,
    // no reason to serialize them.
    const [uploadedImage, prediction] = await Promise.all([
      this.storageService.uploadScanImage(input.imageBuffer, input.mimetype),
      this.aiClient.predict(input.imageBuffer, input.mimetype),
    ]);

    const confidence = toConfidencePercent(prediction.confidence);
    const personalColor = derivePersonalColor(prediction.skin_tone, prediction.undertone);
    const undertoneKey = normalizeUndertone(prediction.undertone);
    const skinToneKey = normalizeSkinTone(prediction.skin_tone);

    const shadeMapping = await this.db.shadeMapping.findUnique({
      where: {
        personalColor_undertone_skinTone: {
          personalColor,
          undertone: undertoneKey,
          skinTone: skinToneKey,
        },
      },
    });
    const bestColorPalette: ColorSwatch[] = shadeMapping ? resolveColorPalette(shadeMapping) : [];

    // Computed before scan.create (doesn't depend on scan.id) so both the
    // matched products and the generated narrative can be persisted in a
    // single write below, instead of a create-then-update.
    const budgetRange = parseBudgetRangeIDR(input.budgetPref);
    const matches = await this.buildRecommendations(
      page.affiliatorId,
      personalColor,
      prediction.undertone,
      prediction.skin_tone,
      budgetRange,
      input.finishPref,
      input.skinPref,
    );

    // RAG-style narrative: retrieval already happened above (shadeMapping +
    // matches, both from real DB data), Gemini just phrases it. Never
    // throws — returns null on any failure so the scan still succeeds and
    // the frontend falls back to its own template (see GeminiClient).
    const matchSummary = await this.geminiClient.generateScanNarrative({
      followerName: input.followerName,
      skinTone: prediction.skin_tone,
      undertone: prediction.undertone,
      faceShape: prediction.face_shape,
      personalColor,
      palette: bestColorPalette,
      topProducts: matches.slice(0, 3).map((m) => ({
        name: m.product.name,
        brand: m.product.brand,
        category: m.product.category,
      })),
      skinPref: input.skinPref,
      finishPref: input.finishPref,
      budgetPref: input.budgetPref,
    });

    const scan = await this.db.scan.create({
      data: {
        userId: null,
        aiPageId: page.id,
        imagePath: uploadedImage.key,
        skinTone: prediction.skin_tone,
        undertone: prediction.undertone,
        faceShape: prediction.face_shape,
        confidence,
        rawAiResponse: prediction as unknown as Prisma.InputJsonValue,
        personalColor,
        bestColorPalette: bestColorPalette as unknown as Prisma.InputJsonValue,
        matchSummary,
      },
    });

    const recommendation = await this.db.recommendation.create({
      data: {
        userId: null,
        scanId: scan.id,
        reasons: { personalColor, undertone: prediction.undertone, skinTone: prediction.skin_tone, matches } as unknown as Prisma.InputJsonValue,
        products: {
          create: matches.map((m) => ({
            productId: m.product.productId,
            listingId: m.product.id,
            matchScore: m.matchScore,
            explanations: [m.aiReason],
          })),
        },
      },
    });
    void recommendation;

    const lead = await this.db.customerLead.create({
      data: {
        aiPageId: page.id,
        scanId: scan.id,
        followerName: input.followerName ?? 'Visitor',
        followerHandle: input.followerHandle,
        email: input.email,
        selfieUrl: uploadedImage.publicUrl,
        matchedProductCount: matches.length,
        topMatchedProduct: matches[0]?.product.name ?? null,
        location: input.location,
      },
    });

    logger.info('Public AI page scan completed', {
      aiPageId: page.id,
      scanId: scan.id,
      leadId: lead.id,
      personalColor,
      matchCount: matches.length,
    });

    return {
      leadId: lead.id,
      scanId: scan.id,
      confidence,
      personalColor,
      undertone: prediction.undertone,
      skinTone: prediction.skin_tone,
      faceShape: prediction.face_shape,
      bestColorPalette,
      recommendedProducts: matches,
      matchSummary,
    };
  }

  private async buildRecommendations(
    affiliatorId: string,
    personalColor: Awaited<ReturnType<typeof derivePersonalColor>>,
    undertone: string,
    skinTone: string,
    budgetRange: PriceRange | null = null,
    finishPref?: string,
    skinPref?: string,
  ): Promise<RecommendedListingDto[]> {
    const datasetMatches = await rankListingsFromDataset(this.db, affiliatorId, personalColor, undertone, skinTone, TOP_N);
    const matchedListingIds = new Set(datasetMatches.map((m) => m.listingId));

    const listingRows = await this.db.affiliatorListing.findMany({
      where: { id: { in: [...matchedListingIds] } },
      include: { product: true },
    });
    const listingById = new Map(listingRows.map((row) => [row.id, toListingDto(row)]));

    const inBudget = (listing: ListingDto): boolean =>
      !budgetRange || (listing.price >= budgetRange.min && listing.price <= budgetRange.max);

    const results: RecommendedListingDto[] = [];
    for (const match of datasetMatches) {
      const listing = listingById.get(match.listingId);
      if (!listing || !inBudget(listing)) continue;
      results.push({
        product: listing,
        matchScore: match.matchScore,
        recommendedShade: listing.shade ?? undefined,
        aiReason: match.reason,
      });
    }

    // Already-considered listings (whether they made it into `results` or were
    // skipped for being out of budget) shouldn't be re-suggested as filler.
    const excludeIds = new Set(matchedListingIds);
    const fillListings = (extraWhere: Prisma.AffiliatorListingWhereInput, take: number) =>
      take <= 0
        ? Promise.resolve([])
        : this.db.affiliatorListing.findMany({
            where: { affiliatorId, status: 'ACTIVE', id: { notIn: [...excludeIds] }, ...extraWhere },
            include: { product: true },
            orderBy: { matchScoreWeight: 'desc' },
            take,
          });

    if (results.length < TOP_N) {
      const priceWhere: Prisma.AffiliatorListingWhereInput = budgetRange
        ? {
            OR: [
              {
                priceOverride: {
                  gte: budgetRange.min,
                  ...(Number.isFinite(budgetRange.max) ? { lte: budgetRange.max } : {}),
                },
              },
              {
                priceOverride: null,
                product: {
                  price: {
                    gte: budgetRange.min,
                    ...(Number.isFinite(budgetRange.max) ? { lte: budgetRange.max } : {}),
                  },
                },
              },
            ],
          }
        : {};

      // 1. First pass: fill with in-budget listings
      const fillerRows = await fillListings(priceWhere, TOP_N - results.length);
      for (const row of fillerRows) {
        const listing = toListingDto(row);
        let matchScore = listing.matchScoreWeight || 88;
        let aiReason = `Rekomendasi formula terbaik untuk ${skinTone} skin & ${undertone} undertone`;

        if (finishPref) {
          const fp = finishPref.toLowerCase();
          if ((fp.includes('dewy') || fp.includes('glow')) && (listing.finish === 'dewy' || listing.name.toLowerCase().includes('glow') || listing.name.toLowerCase().includes('hydra'))) {
            matchScore = Math.min(98, matchScore + 8);
            aiReason = `Cocok untuk undertone ${undertone} dengan hasil akhir dewy & glowing sesuai preferensi Anda`;
          } else if ((fp.includes('matte') || fp.includes('velvet')) && (listing.finish === 'matte' || listing.name.toLowerCase().includes('matte') || listing.name.toLowerCase().includes('stay'))) {
            matchScore = Math.min(98, matchScore + 8);
            aiReason = `Cocok untuk undertone ${undertone} dengan hasil akhir matte oil-control sesuai preferensi Anda`;
          } else if ((fp.includes('natural') || fp.includes('satin')) && (listing.finish === 'natural' || listing.finish === 'satin' || listing.name.toLowerCase().includes('natural'))) {
            matchScore = Math.min(98, matchScore + 8);
            aiReason = `Formula natural satin yang ringan dan pas untuk undertone ${undertone}`;
          }
        }

        if (skinPref && listing.suitableSkinTypes.some((st) => st.toLowerCase().includes(skinPref.toLowerCase()))) {
          matchScore = Math.min(99, matchScore + 5);
          aiReason += ` • Diformulasikan untuk jenis kulit ${skinPref}`;
        }

        results.push({
          product: listing,
          matchScore,
          recommendedShade: listing.shade ?? undefined,
          aiReason,
        });
        excludeIds.add(row.id);
      }

      // 2. Second pass: if results are still fewer than 12, fill with remaining creator listings
      if (results.length < 12) {
        const remainingFiller = await fillListings({}, 16 - results.length);
        for (const row of remainingFiller) {
          const listing = toListingDto(row);
          results.push({
            product: listing,
            matchScore: Math.max(82, (listing.matchScoreWeight || 85) - 4),
            recommendedShade: listing.shade ?? undefined,
            aiReason: `Rekomendasi formula ${listing.brand} untuk melengkapi riasan ${personalColor} ${undertone} Anda`,
          });
          excludeIds.add(row.id);
        }
      }
    }

    // Enrich every recommended product with exact shade variant resolution
    const enrichedResults: RecommendedListingDto[] = results.map((item, index) => {
      const shadeResolution = resolveExactShade(
        {
          name: item.product.name,
          brand: item.product.brand,
          category: item.product.category,
          subcategory: item.product.subcategory,
          shade: item.recommendedShade || item.product.shade,
        },
        skinTone,
        undertone,
        personalColor,
      );

      return {
        ...item,
        recommendedShade: shadeResolution.exactShade,
        shadeHex: shadeResolution.shadeHex,
        shadeRationale: shadeResolution.rationale,
        alternatives: shadeResolution.alternatives,
        isCreatorTopPick: index < 2, // Top 2 highest-scoring products get creator pick badge
        aiReason: `${item.aiReason} • Shade ${shadeResolution.exactShade} dipilih khusus untuk rona ${skinTone} ${undertone}.`,
      };
    });

    return enrichedResults;
  }

  async listForAffiliator(affiliatorId: string): Promise<CustomerLeadDto[]> {
    const rows = await this.db.customerLead.findMany({
      where: { aiPage: { affiliatorId } },
      include: { scan: true },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      scanDate: row.createdAt.toISOString(),
      followerName: row.followerName,
      followerHandle: row.followerHandle,
      email: row.email,
      age: row.location && !isNaN(Number(row.location)) ? Number(row.location) : null,
      selfieUrl: row.selfieUrl,
      detectedSkinTone: row.scan.skinTone,
      detectedUndertone: row.scan.undertone,
      personalColor: row.scan.personalColor,
      confidence: row.scan.confidence,
      faceShape: row.scan.faceShape,
      bestColorPalette: (row.scan.bestColorPalette as unknown as ColorSwatch[] | null) ?? [],
      matchSummary: row.scan.matchSummary,
      matchedProductCount: row.matchedProductCount,
      topMatchedProduct: row.topMatchedProduct,
      clickedAffiliate: row.clickedAffiliate,
      estimatedCommission: row.estimatedCommission,
      location: row.location,
    }));
  }

  async updateLeadProfile(
    leadId: string,
    data: { followerName?: string; followerHandle?: string; email?: string; age?: number | string },
  ): Promise<CustomerLeadDto> {
    const row = await this.db.customerLead.update({
      where: { id: leadId },
      data: {
        ...(data.followerName !== undefined ? { followerName: data.followerName } : {}),
        ...(data.followerHandle !== undefined ? { followerHandle: data.followerHandle } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.age !== undefined ? { location: String(data.age) } : {}),
      },
      include: { scan: true },
    });

    return {
      id: row.id,
      scanDate: row.createdAt.toISOString(),
      followerName: row.followerName,
      followerHandle: row.followerHandle,
      email: row.email,
      age: row.location && !isNaN(Number(row.location)) ? Number(row.location) : null,
      selfieUrl: row.selfieUrl,
      detectedSkinTone: row.scan.skinTone,
      detectedUndertone: row.scan.undertone,
      personalColor: row.scan.personalColor,
      confidence: row.scan.confidence,
      faceShape: row.scan.faceShape,
      bestColorPalette: (row.scan.bestColorPalette as unknown as ColorSwatch[] | null) ?? [],
      matchSummary: row.scan.matchSummary,
      matchedProductCount: row.matchedProductCount,
      topMatchedProduct: row.topMatchedProduct,
      clickedAffiliate: row.clickedAffiliate,
      estimatedCommission: row.estimatedCommission,
      location: row.location,
    };
  }

  async recordClick(leadId: string | undefined, listingId: string): Promise<void> {
    const listing = await this.db.affiliatorListing.findUnique({
      where: { id: listingId },
      include: { product: true },
    });
    if (!listing) throw new ValidationError('Unknown listing');

    const price = listing.priceOverride ?? listing.product.price;
    const estimatedCommission = Math.round(price * 0.1);

    await this.db.$transaction([
      this.db.clickEvent.create({
        data: {
          affiliatorId: listing.affiliatorId,
          listingId,
          leadId,
          converted: true,
          revenue: estimatedCommission,
        },
      }),
      this.db.affiliatorListing.update({
        where: { id: listingId },
        data: {
          clicks: { increment: 1 },
          conversions: { increment: 1 },
          revenueGenerated: { increment: estimatedCommission },
        },
      }),
      ...(leadId
        ? [
            this.db.customerLead.update({
              where: { id: leadId },
              data: { clickedAffiliate: true, estimatedCommission },
            }),
          ]
        : []),
    ]);
  }
}
