/**
 * Demo affiliator seed — creates one AFFILIATOR account, a published AIPage,
 * and a starter AffiliatorListing catalog drawn from the imported dataset
 * products, so Frontend-3.0 has real (not mock) data to render immediately.
 *
 * Requires `npm run import:dataset` to have been run first.
 *
 *   npm run seed:demo-affiliator
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'kate@auraai.local';
const DEMO_PASSWORD = 'Affiliator123!';
const DEMO_HANDLE = 'kate-glow';
const DEMO_SLUG = 'kate-glow';

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      isEmailVerified: true,
      isTwoFactorEnabled: false,
    },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      role: 'AFFILIATOR',
      isEmailVerified: true,
      isTwoFactorEnabled: false,
      profile: { create: { name: 'Kate Jenkins' } },
    },
  });

  const affiliator = await prisma.affiliatorProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      handle: DEMO_HANDLE,
      niche: 'Everyday glow makeup for Indonesian skin tones',
      apiKey: `aura_live_demo_${user.id.slice(0, 12)}`,
      status: 'APPROVED',
      tier: 'PRO',
      planStatus: 'ACTIVE',
      followersCount: '420K',
    },
  });

  const page = await prisma.aIPage.upsert({
    where: { slug: DEMO_SLUG },
    update: { status: 'PUBLISHED' },
    create: {
      affiliatorId: affiliator.id,
      slug: DEMO_SLUG,
      title: 'Find Your Perfect Match with Kate',
      welcomeMessage: 'Upload a selfie and get makeup picks matched to your skin tone.',
      primaryColor: '#ff5a8a',
      accentColor: '#ffd166',
      allowCameraUpload: true,
      status: 'PUBLISHED',
    },
  });

  const subcategories = [
    'Cushion',
    'Foundation',
    'Concealer',
    'Blush',
    'Lip Cream',
    'Lip Tint',
    'Lipstick',
    'Eyeshadow',
    'Loose Powder',
    'Pressed Powder',
  ];
  const products = await Promise.all(
    subcategories.map(async (subcategory) => {
      // Prioritize active scraped SOCO products with images
      const socoProducts = await prisma.product.findMany({
        where: { socoId: { not: null }, isActive: true, imageUrl: { not: null }, subcategory },
        take: 3,
        orderBy: { reviewCount: 'desc' },
      });
      if (socoProducts.length > 0) return socoProducts;

      return prisma.product.findMany({
        where: { category: subcategory, isActive: true },
        take: 3,
        orderBy: { createdAt: 'asc' },
      });
    }),
  );
  // Dedup products by ID
  const productMap = new Map<string, (typeof products)[0][0]>();
  for (const list of products) {
    for (const p of list) {
      productMap.set(p.id, p);
    }
  }
  const flatProducts = Array.from(productMap.values());

  const listings = [];
  for (const product of flatProducts) {
    const listing = await prisma.affiliatorListing.upsert({
      where: { affiliatorId_productId: { affiliatorId: affiliator.id, productId: product.id } },
      update: {},
      create: {
        affiliatorId: affiliator.id,
        productId: product.id,
        affiliateUrl: product.affiliateUrl ?? product.sourceUrl ?? 'https://www.sociolla.com',
        matchScoreWeight: 85,
      },
    });
    listings.push(listing);
  }

  await prisma.aIPageFeaturedListing.deleteMany({ where: { aiPageId: page.id } });
  await prisma.aIPageFeaturedListing.createMany({
    data: listings.slice(0, 8).map((listing, position) => ({
      aiPageId: page.id,
      listingId: listing.id,
      position,
    })),
  });

  // eslint-disable-next-line no-console
  console.log(
    `Seeded demo affiliator: email=${DEMO_EMAIL} password=${DEMO_PASSWORD} page=/${DEMO_SLUG} listings=${listings.length}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
