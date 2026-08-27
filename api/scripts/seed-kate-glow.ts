import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const affiliator = await prisma.affiliatorProfile.findUnique({ where: { handle: 'kate-glow' } });
  const aiPage = await prisma.aIPage.findUnique({ where: { slug: 'kate-glow' } });

  if (!affiliator || !aiPage) {
    console.error('Affiliator kate-glow or AI page not found');
    process.exit(1);
  }

  const lipProducts = await prisma.product.findMany({
    where: { category: 'Lips', isActive: true },
    take: 30,
    orderBy: { reviewCount: 'desc' },
  });

  const faceProducts = await prisma.product.findMany({
    where: { category: 'Face', isActive: true },
    take: 30,
    orderBy: { reviewCount: 'desc' },
  });

  const allProducts = [...lipProducts, ...faceProducts];
  console.log(`Linking ${lipProducts.length} Lips and ${faceProducts.length} Face products to kate-glow...`);

  const listingIds: string[] = [];

  for (const p of allProducts) {
    const listing = await prisma.affiliatorListing.upsert({
      where: {
        affiliatorId_productId: {
          affiliatorId: affiliator.id,
          productId: p.id,
        },
      },
      update: {
        status: 'ACTIVE',
      },
      create: {
        affiliatorId: affiliator.id,
        productId: p.id,
        affiliateUrl: p.affiliateUrl ?? p.sourceUrl ?? 'https://www.sociolla.com',
        matchScoreWeight: 88,
        status: 'ACTIVE',
      },
    });
    listingIds.push(listing.id);
  }

  await prisma.aIPageFeaturedListing.deleteMany({
    where: { aiPageId: aiPage.id },
  });

  await prisma.aIPageFeaturedListing.createMany({
    data: listingIds.slice(0, 16).map((listingId, position) => ({
      aiPageId: aiPage.id,
      listingId,
      position,
    })),
  });

  const totalLips = await prisma.product.count({ where: { category: 'Lips' } });
  const totalFace = await prisma.product.count({ where: { category: 'Face' } });
  const totalEyes = await prisma.product.count({ where: { category: 'Eyes' } });
  const totalInDb = await prisma.product.count();
  const brands = await prisma.product.groupBy({ by: ['brand'], _count: { id: true } });

  console.log('\n====================================================');
  console.log('🎉 KATALOG KATE-GLOW BERHASIL DIHUBUNGKAN!');
  console.log(`📦 Total Produk di DB: ${totalInDb}`);
  console.log(`💋 Produk Lips: ${totalLips}`);
  console.log(`🧖‍♀️ Produk Face & Base: ${totalFace}`);
  console.log(`👁️ Produk Eyes: ${totalEyes}`);
  console.log(`🏷️ Total Brand Unik: ${brands.length}`);
  console.log(`🔗 Total Listing Aktif kate-glow: ${listingIds.length}`);
  console.log('====================================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
