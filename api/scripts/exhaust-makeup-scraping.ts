import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const CATALOG_API = 'https://catalog-api.soco.id/v3/products';
const PAGE_SIZE = 20;
const DELAY_MS = 150;
const REVIEW_BASE = 'https://review.soco.id';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function coverImage(images: any[] | undefined): string | null {
  if (!images?.length) return null;
  return (images.find((img) => img.is_cover) ?? images[0])?.url ?? null;
}

// ---------------------------------------------------------------------------
// FILTER KHUSUS & KETAT: HANYA PRODUK LIPS DAN FACE & BASE (EXCLUDE NON-MAKEUP & EYES)
// ---------------------------------------------------------------------------

interface MakeupClassification {
  category: 'Lips' | 'Face';
  mainCategory: 'Lips' | 'Face & Shade';
  subcategory: string;
}

function classifyLipsAndFace(product: any): MakeupClassification | null {
  const cats = (product.categories ?? []).map((c: any) => ({
    name: (c.name || '').trim(),
    slug: (c.slug || '').toLowerCase(),
    sqlId: c.my_soco_sql_id,
  }));

  const name = (product.name || '').toLowerCase();
  const defCat = (product.default_category?.name || '').toLowerCase();
  const allCatNames = cats.map((c: any) => c.name.toLowerCase()).join(' ');

  // 1. REJECT LIST: Produk yang BUKAN Lips atau Face & Base
  const EXCLUDE_REGEX = /perfume|eau de parfum|eau de toilette|body mist|deodorant|sheet mask|masker wajah|clay mask|sleeping mask|wash off mask|toner|face serum|serum wajah|essence|ampoule|face wash|facial wash|micellar water|cleansing oil|cleansing balm|cleansing gel|cleansing wipes|sunscreen|sunblock|sun protection|body lotion|body serum|body wash|body scrub|body butter|shampoo|conditioner|hair mask|hair tonic|hair serum|hair oil|hair spray|dry shampoo|acne patch|pimple patch|hand & foot|cotton pad|blotting paper|feminine wash|peeling|mascara|eyeshadow|eye shadow|eyeliner|eye liner|eyebrow|eye brow|brow pencil|brow pomade|brow mascara|eyelash|bulu mata/;

  if (EXCLUDE_REGEX.test(name) || EXCLUDE_REGEX.test(defCat)) {
    if (!name.includes('cushion') && !name.includes('lip') && !name.includes('foundation') && !name.includes('powder')) {
      return null;
    }
  }

  if (allCatNames.includes('eyes') || allCatNames.includes('eye makeup')) {
    return null;
  }

  // 2. KLASIFIKASI KATEGORI LIPS
  const LIPS_KEYWORDS = [
    { match: /lip tint|liptint/, sub: 'Lip Tint' },
    { match: /lip cream|lipcream|creamatte/, sub: 'Lip Cream' },
    { match: /lip velvet|lip mousse/, sub: 'Lip Velvet' },
    { match: /lip gloss|lipgloss/, sub: 'Lip Gloss' },
    { match: /lip stain|lipstain/, sub: 'Lip Stain' },
    { match: /lip crayon|lip liner/, sub: 'Lipstick' },
    { match: /lip balm|lip mask|lip butter|lip shield|lip oil/, sub: 'Lip Balm' },
    { match: /lipstick|lip stick|lip color|lip colour|lip matte/, sub: 'Lipstick' },
  ];

  for (const rule of LIPS_KEYWORDS) {
    if (rule.match.test(name) || rule.match.test(defCat) || allCatNames.includes('lips')) {
      const subcategory = rule.match.test(name) ? rule.sub : (product.default_category?.name ?? rule.sub);
      return {
        category: 'Lips',
        mainCategory: 'Lips',
        subcategory,
      };
    }
  }

  // 3. KLASIFIKASI KATEGORI FACE & BASE
  const FACE_KEYWORDS = [
    { match: /cushion/, sub: 'Cushion' },
    { match: /foundation|skin tint|bb cream|cc cream/, sub: 'Foundation' },
    { match: /concealer|color corrector/, sub: 'Concealer' },
    { match: /loose powder|translucent powder/, sub: 'Loose Powder' },
    { match: /two way cake|compact powder|pressed powder|powder foundation/, sub: 'Pressed Powder' },
    { match: /powder|bedak/, sub: 'Powder' },
    { match: /blush|cheeklit|cheek tint/, sub: 'Blush' },
    { match: /highlighter|illuminator/, sub: 'Highlighter' },
    { match: /contour|bronzer/, sub: 'Contour & Bronzer' },
    { match: /primer|make up base|makeup base/, sub: 'Primer' },
    { match: /setting spray|fixing spray/, sub: 'Setting Spray' },
  ];

  for (const rule of FACE_KEYWORDS) {
    if (rule.match.test(name) || rule.match.test(defCat) || allCatNames.includes('face')) {
      const subcategory = rule.match.test(name) ? rule.sub : (product.default_category?.name ?? rule.sub);
      return {
        category: 'Face',
        mainCategory: 'Face & Shade',
        subcategory,
      };
    }
  }

  return null;
}

function buildDescription(product: any, category: string, subcategory: string): string {
  const cleaned = stripHtml(product.description);
  if (cleaned.length >= 40) return cleaned.slice(0, 4000);

  const brand = product.brand?.name ?? 'Unknown';
  const rating = product.review_stats?.average_rating;
  const reviews = product.review_stats?.total_reviews;
  const meta = [
    rating != null ? `SOCO ${rating.toFixed(1)}★` : null,
    reviews != null ? `${reviews} ulasan` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return `${brand} ${product.name} — kosmetik makeup ${category} / ${subcategory} pilihan resmi dari SOCO Sociolla.${meta ? ` ${meta}.` : ''}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(params: Record<string, any>): Promise<any[]> {
  try {
    const response = await axios.get<{ success: boolean; data: any[] }>(CATALOG_API, {
      params,
      headers: {
        Accept: 'application/json',
        Origin: REVIEW_BASE,
        Referer: `${REVIEW_BASE}/category/1/makeup`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      timeout: 8_000,
    });

    if (response.data?.success && Array.isArray(response.data.data)) {
      return response.data.data;
    }
    return [];
  } catch {
    return [];
  }
}

async function processProduct(product: any, savedIds: Set<string>): Promise<boolean> {
  if (!product?._id || savedIds.has(product._id)) return false;

  const brand = product.brand?.name?.trim();
  const name = product.name?.trim();
  if (!brand || !name) return false;

  const makeup = classifyLipsAndFace(product);
  if (!makeup) return false;

  const { category, mainCategory, subcategory } = makeup;
  const slug = slugify(`soco-${brand}-${name}-${product._id.slice(-6)}`);
  const imageUrl = coverImage(product.images);
  const rating = product.review_stats?.average_rating ?? null;
  const reviewCount = product.review_stats?.total_reviews ?? 0;
  const benefits = (product.benefits ?? []).map((b: any) => b.name).filter(Boolean);
  const tags = [
    brand,
    category,
    subcategory,
    rating != null ? `SOCO rating ${rating.toFixed(1)}` : null,
    reviewCount > 0 ? `${reviewCount} reviews` : null,
  ].filter((v): v is string => Boolean(v));

  const sourceUrl = product.slug
    ? `${REVIEW_BASE}/product/${product.slug}`
    : (product.url_sociolla ?? `${REVIEW_BASE}/category/1/makeup`);

  const nameLower = name.toLowerCase();
  const finish = nameLower.includes('matte')
    ? 'matte'
    : nameLower.includes('dewy') || nameLower.includes('glow')
      ? 'dewy'
      : nameLower.includes('satin')
        ? 'satin'
        : 'natural';

  const suitableUndertones: string[] = [];
  const suitableSkinTones: string[] = [];

  if (nameLower.includes('warm') || nameLower.includes('golden') || nameLower.includes('caramel') || nameLower.includes('honey') || nameLower.includes('tan') || nameLower.includes('sand')) {
    suitableUndertones.push('Warm', 'Neutral');
  } else if (nameLower.includes('cool') || nameLower.includes('pink') || nameLower.includes('ivory') || nameLower.includes('rose') || nameLower.includes('porcelain')) {
    suitableUndertones.push('Cool', 'Neutral');
  } else {
    suitableUndertones.push('Warm', 'Cool', 'Neutral');
  }

  if (nameLower.includes('light') || nameLower.includes('fair') || nameLower.includes('ivory') || nameLower.includes('porcelain') || nameLower.includes('vanilla')) {
    suitableSkinTones.push('Fair', 'Light');
  } else if (nameLower.includes('medium') || nameLower.includes('natural') || nameLower.includes('beige') || nameLower.includes('sand')) {
    suitableSkinTones.push('Light', 'Medium', 'Tan');
  } else if (nameLower.includes('tan') || nameLower.includes('caramel') || nameLower.includes('deep') || nameLower.includes('honey') || nameLower.includes('warm')) {
    suitableSkinTones.push('Medium', 'Tan', 'Deep');
  } else {
    suitableSkinTones.push('Light', 'Medium', 'Tan', 'Deep');
  }

  const suitableSkinTypes: string[] = [];
  if (finish === 'matte') {
    suitableSkinTypes.push('Oily', 'Combination');
  } else if (finish === 'dewy') {
    suitableSkinTypes.push('Dry', 'Normal');
  } else {
    suitableSkinTypes.push('Normal', 'Combination', 'Oily', 'Dry', 'Sensitive');
  }

  const price = product.min_price || product.max_price || 99000;
  const originalPrice = product.max_price && product.max_price > price ? product.max_price : null;

  try {
    await prisma.product.upsert({
      where: { socoId: product._id },
      update: {
        name,
        brand,
        category,
        mainCategory,
        subcategory,
        price,
        originalPrice,
        imageUrl,
        affiliateUrl: sourceUrl,
        sourceUrl,
        description: buildDescription(product, category, subcategory),
        rating,
        reviewCount,
        finish,
        suitableUndertones,
        suitableSkinTones,
        suitableSkinTypes,
        benefits,
        tags,
        isActive: true,
      },
      create: {
        socoId: product._id,
        name,
        slug,
        brand,
        category,
        mainCategory,
        subcategory,
        price,
        originalPrice,
        imageUrl,
        affiliateUrl: sourceUrl,
        sourceUrl,
        description: buildDescription(product, category, subcategory),
        rating,
        reviewCount,
        finish,
        suitableUndertones,
        suitableSkinTones,
        suitableSkinTypes,
        benefits,
        tags,
        isActive: true,
        matchScoreWeight: rating ? Math.min(98, Math.round(rating * 19.5)) : 88,
      },
    });
    savedIds.add(product._id);
    return true;
  } catch {
    return false;
  }
}

async function runResetAndExhaustiveScrape() {
  console.log('========================================================================');
  console.log('🧹 TAHAP 1: RESET TOTAL DATABASE PRODUK');
  console.log('========================================================================\n');

  console.log('Menghapus seluruh data listing affiliator & produk lama...');
  await prisma.aIPageFeaturedListing.deleteMany({});
  await prisma.affiliatorListing.deleteMany({});
  await prisma.recommendationProduct.deleteMany({});
  await prisma.recommendationRule.deleteMany({});
  await prisma.productIngredient.deleteMany({});
  const deletedProducts = await prisma.product.deleteMany({});
  console.log(`✅ Berhasil mereset database. ${deletedProducts.count} produk lama telah dibersihkan.\n`);

  console.log('========================================================================');
  console.log('🚀 TAHAP 2: MEMULAI SCRAPING ULANG LENGKAP (LIPS & FACE/BASE)');
  console.log('🎯 Target: Seluruh Produk Bibir & Wajah dari SOCO Tanpa Campuran Non-Makeup');
  console.log('========================================================================\n');

  const savedIds = new Set<string>();

  // DAFTAR QUERY KATA KUNCI LENGKAP
  const KEYWORDS = [
    // Lips
    'lip tint', 'liptint', 'lip cream', 'lipcream', 'lipstick', 'lip velvet', 'lip gloss',
    'lipgloss', 'lip stain', 'lip balm', 'lip crayon', 'lip mousse', 'lip oil', 'lip matte',
    'lip butter', 'lip glaze',
    // Face & Base
    'cushion', 'cushion foundation', 'foundation', 'skin tint', 'bb cream', 'cc cream',
    'concealer', 'loose powder', 'pressed powder', 'two way cake', 'compact powder',
    'translucent powder', 'bedak tabur', 'bedak padat', 'blush on', 'blush', 'cheek tint',
    'cream blush', 'primer', 'make up base', 'setting spray', 'fixing spray',
    'contour', 'highlighter', 'bronzer', 'illuminator',
    // Brand-Brand Terkenal
    'Wardah', 'Make Over', 'Maybelline', 'ESQA', 'Somethinc', 'Skintific', 'Rose All Day',
    'Luxcrime', 'Dear Me Beauty', 'BLP Beauty', 'Emina', 'Pixy', 'Hanasui', 'Salsa',
    'Implora', 'Focallure', 'O.TWO.O', 'Madame Gie', 'barenbliss', 'Dazzle Me', 'Revlon',
    'Sea Makeup', 'Judydoll', 'Romand', 'Peripera', 'Clio', 'Etude', 'Innisfree',
    'Studio Tropik', 'Jacquelle', 'Instaperfect', 'Guele', 'Mother of Pearl', 'MOP'
  ];

  const SORT_ORDERS = [
    '-review_stats.total_reviews',
    '-review_stats.average_rating',
    '-created_at',
    'price',
    '-price',
  ];

  let newItemsCount = 0;

  // 1. ITERASI SEMUA SORT ORDER PADA KATALOG MAKEUP UTAMA
  console.log('🔄 Sesi 1: Menjelajahi Seluruh Urutan Sortir Katalog Utama...');
  for (const sort of SORT_ORDERS) {
    for (let skip = 0; skip <= 600; skip += PAGE_SIZE) {
      const items = await fetchPage({
        limit: PAGE_SIZE,
        skip,
        sort,
      });

      if (items.length === 0) break;

      for (const item of items) {
        const added = await processProduct(item, savedIds);
        if (added) newItemsCount++;
      }

      process.stdout.write(`\r  ✨ Sort: ${sort} | Skip: ${skip} | Total DB: ${savedIds.size} produk tersimpan`);
      await sleep(DELAY_MS);
    }
  }

  // 2. ITERASI PENCARIAN BERDASARKAN SEMUA KATA KUNCI & BRAND
  console.log('\n\n🔍 Sesi 2: Menjelajahi Seluruh Kata Kunci Subkategori & Brand...');
  for (const q of KEYWORDS) {
    for (let skip = 0; skip <= 300; skip += PAGE_SIZE) {
      const items = await fetchPage({
        q,
        limit: PAGE_SIZE,
        skip,
      });

      if (items.length === 0) break;

      for (const item of items) {
        const added = await processProduct(item, savedIds);
        if (added) newItemsCount++;
      }

      process.stdout.write(`\r  🔎 Query: "${q}" | Skip: ${skip} | Total DB: ${savedIds.size} produk tersimpan`);
      await sleep(DELAY_MS);
    }
  }

  // 3. REFRESH DEMO AFFILIATOR KATE-GLOW
  console.log('\n\n🔗 Sesi 3: Menghubungkan Katalog Demo kate-glow dengan Produk Terbaik...');
  try {
    const affiliator = await prisma.affiliatorProfile.findUnique({ where: { handle: 'kate-glow' } });
    const aiPage = await prisma.aIPage.findUnique({ where: { slug: 'kate-glow' } });

    if (affiliator && aiPage) {
      const lipProducts = await prisma.product.findMany({
        where: { socoId: { not: null }, category: 'Lips', isActive: true },
        take: 35,
        orderBy: { reviewCount: 'desc' },
      });

      const faceProducts = await prisma.product.findMany({
        where: { socoId: { not: null }, category: 'Face', isActive: true },
        take: 35,
        orderBy: { reviewCount: 'desc' },
      });

      const allCreatorProducts = [...lipProducts, ...faceProducts];

      const listings = [];
      for (const product of allCreatorProducts) {
        try {
          const listing = await prisma.affiliatorListing.upsert({
            where: { affiliatorId_productId: { affiliatorId: affiliator.id, productId: product.id } },
            update: { status: 'ACTIVE' },
            create: {
              affiliatorId: affiliator.id,
              productId: product.id,
              affiliateUrl: product.affiliateUrl ?? product.sourceUrl ?? 'https://www.sociolla.com',
              matchScoreWeight: 88,
              status: 'ACTIVE',
            },
          });
          listings.push(listing);
        } catch {}
      }

      await prisma.aIPageFeaturedListing.deleteMany({ where: { aiPageId: aiPage.id } });
      await prisma.aIPageFeaturedListing.createMany({
        data: listings.slice(0, 16).map((listing, position) => ({
          aiPageId: aiPage.id,
          listingId: listing.id,
          position,
        })),
      });
      console.log(`✅ Berhasil menghubungkan ${listings.length} produk unggulan (Lips: ${lipProducts.length}, Face: ${faceProducts.length}) ke affiliator kate-glow.`);
    }
  } catch (err: any) {
    console.warn('⚠️ Affiliator link note:', err.message);
  }

  // 4. STATISTIK AKHIR
  const totalLips = await prisma.product.count({ where: { category: 'Lips', socoId: { not: null } } });
  const totalFace = await prisma.product.count({ where: { category: 'Face', socoId: { not: null } } });
  const totalAll = await prisma.product.count({ where: { socoId: { not: null } } });
  const brands = await prisma.product.groupBy({ by: ['brand'], where: { socoId: { not: null } }, _count: { id: true } });

  console.log('\n========================================================================');
  console.log('🎉 RESET & RE-SCRAPING SELESAI DENGAN SUKSES!');
  console.log(`📦 Total Seluruh Produk Makeup Bersih di DB : ${totalAll} Produk`);
  console.log(`💋 Produk Bibir (Lips)                       : ${totalLips} Produk`);
  console.log(`🧖‍♀️ Produk Wajah (Face & Base)                 : ${totalFace} Produk`);
  console.log(`🏷️ Total Brand Kosmetik Resmi                : ${brands.length} Brand`);
  console.log('========================================================================\n');
}

runResetAndExhaustiveScrape()
  .catch((err) => {
    console.error('Reset & Scraping error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
