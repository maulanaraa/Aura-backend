import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Find Steven Julian's affiliator profile and AI Page
  const affiliator = await prisma.affiliatorProfile.findFirst({
    where: {
      OR: [
        { handle: { contains: 'stevenjulian', mode: 'insensitive' } },
        { user: { email: { contains: 'stevenjulian', mode: 'insensitive' } } },
      ],
    },
    include: {
      pages: true,
      user: { include: { profile: true } },
    },
  });

  if (!affiliator) {
    console.error('Affiliator profile for Steven Julian not found!');
    process.exit(1);
  }

  console.log(`Found affiliator: ${affiliator.user.profile?.name || affiliator.handle} (ID: ${affiliator.id})`);

  // 2. Fetch all products from master catalog
  const masterProducts = await prisma.product.findMany({ select: { id: true, brand: true, name: true, shade: true } });
  console.log(`Total master catalog products: ${masterProducts.length}`);

  if (masterProducts.length === 0) {
    console.log('No master products found in database.');
    return;
  }

  // 3. Fast bulk insert using createMany
  const listingsData = masterProducts.map((product) => ({
    affiliatorId: affiliator.id,
    productId: product.id,
    affiliateUrl: `https://shopee.co.id/search?keyword=${encodeURIComponent(product.brand + ' ' + product.name)}`,
    status: 'ACTIVE' as const,
    matchScoreWeight: 85,
    affiliatorNote: `Rekomendasi pilihan ${affiliator.user.profile?.name || 'Steven'} untuk shade ${product.shade || 'Natural'}`,
  }));

  const result = await prisma.affiliatorListing.createMany({
    data: listingsData,
    skipDuplicates: true,
  });

  console.log(`Successfully bulk inserted ${result.count} listings!`);

  // 4. Fetch all listings for Steven and link to AIPage
  const allListings = await prisma.affiliatorListing.findMany({
    where: { affiliatorId: affiliator.id },
    select: { id: true },
  });

  console.log(`Total active listings for Steven: ${allListings.length}`);

  const aiPage = affiliator.pages[0];
  if (aiPage) {
    await prisma.aIPageFeaturedListing.deleteMany({
      where: { aiPageId: aiPage.id },
    });

    const featuredListings = allListings.slice(0, 30).map((listing, index) => ({
      aiPageId: aiPage.id,
      listingId: listing.id,
      position: index + 1,
    }));

    await prisma.aIPageFeaturedListing.createMany({
      data: featuredListings,
      skipDuplicates: true,
    });

    console.log(`Linked ${featuredListings.length} featured products to AI Page (${aiPage.slug})!`);
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
