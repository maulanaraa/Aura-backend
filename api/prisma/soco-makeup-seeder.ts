/**
 * SOCO Makeup product seeder for AURA.
 * Source: https://review.soco.id/category/1/makeup
 * API:    https://catalog-api.soco.id/v3/products
 */
import type { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { MAKEUP_TYPES } from '../src/constants/index.js';

const CATALOG_API = 'https://catalog-api.soco.id/v3/products';
const MAKEUP_CATEGORY_SQL_ID = 1;
const PAGE_SIZE = 20;
const DELAY_MS = 700;
const REVIEW_BASE = 'https://review.soco.id';

export interface SeedMakeupOptions {
  limit?: number;
  skip?: number;
  replace?: boolean;
  dryRun?: boolean;
}

export interface SeedMakeupResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  makeupProducts: number;
}

interface SocoImage {
  url: string;
  is_cover?: boolean;
}

interface SocoCategory {
  name: string;
  my_soco_sql_id?: number;
  slug?: string;
}

interface SocoBrand {
  name: string;
  slug?: string;
}

interface SocoProduct {
  _id: string;
  id?: string;
  name: string;
  slug?: string;
  description?: string | null;
  brand?: SocoBrand | null;
  images?: SocoImage[];
  categories?: SocoCategory[];
  default_category?: { name?: string; slug?: string } | null;
  review_stats?: {
    average_rating?: number;
    total_reviews?: number;
  };
  url_sociolla?: string | null;
  min_price?: number | null;
  max_price?: number | null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 180);
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function coverImage(images: SocoImage[] | undefined): string | null {
  if (!images?.length) return null;
  return (images.find((img) => img.is_cover) ?? images[0])?.url ?? null;
}

function resolveCategory(product: SocoProduct): { category: string; subcategory: string } {
  const cats = product.categories ?? [];
  const nonRoot = cats.filter((c) => c.name && c.name.toLowerCase() !== 'makeup');
  const area = nonRoot.find((c) =>
    ['face', 'lips', 'eyes', 'cheeks', 'nails', 'tools & brushes', 'makeup tools'].includes(
      c.name.toLowerCase(),
    ),
  );
  const subcategory =
    product.default_category?.name ?? nonRoot[nonRoot.length - 1]?.name ?? 'Makeup';
  return { category: area?.name ?? 'Makeup', subcategory };
}

function mapMakeupTypeIds(subcategory: string, taxonomy: Map<string, string>): string[] {
  const lower = subcategory.toLowerCase();
  const ids: string[] = [];
  const rules: Array<{ match: RegExp; type: string }> = [
    { match: /foundation/, type: MAKEUP_TYPES.FOUNDATION },
    { match: /concealer/, type: MAKEUP_TYPES.CONCEALER },
    { match: /cushion/, type: MAKEUP_TYPES.CUSHION },
    { match: /loose powder|pressed powder|powder/, type: MAKEUP_TYPES.POWDER },
    { match: /blush|cheek/, type: MAKEUP_TYPES.BLUSH },
    { match: /lip cream|lip mousse|lipstick|lip coat/, type: MAKEUP_TYPES.LIP_CREAM },
    { match: /lip tint|lip stain|lip gloss|lip oil/, type: MAKEUP_TYPES.LIP_TINT },
    { match: /mascara/, type: MAKEUP_TYPES.MASCARA },
    { match: /eyeshadow|eye shadow|palette/, type: MAKEUP_TYPES.EYESHADOW },
    { match: /brow|eyebrow/, type: MAKEUP_TYPES.BROW },
  ];

  for (const rule of rules) {
    if (rule.match.test(lower)) {
      const id = taxonomy.get(rule.type.toLowerCase());
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

function buildDescription(product: SocoProduct, category: string, subcategory: string): string {
  const cleaned = stripHtml(product.description);
  if (cleaned.length >= 40) return cleaned.slice(0, 4000);

  const brand = product.brand?.name ?? 'Unknown';
  const rating = product.review_stats?.average_rating;
  const reviews = product.review_stats?.total_reviews;
  const meta = [
    rating != null ? `SOCO ${rating.toFixed(1)}★` : null,
    reviews != null ? `${reviews} reviews` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return `${brand} ${product.name} — ${category} / ${subcategory} makeup from SOCO.${meta ? ` ${meta}.` : ''}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(skip: number, limit: number): Promise<SocoProduct[]> {
  const filter = JSON.stringify({ 'categories.my_soco_sql_id': MAKEUP_CATEGORY_SQL_ID });
  const response = await axios.get<{ success: boolean; data: SocoProduct[] }>(CATALOG_API, {
    params: {
      limit,
      skip,
      filter,
      sort: '-review_stats.total_reviews',
    },
    headers: {
      Accept: 'application/json',
      Origin: REVIEW_BASE,
      Referer: `${REVIEW_BASE}/category/1/makeup`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
    timeout: 15_000,
  });

  if (!response.data.success || !Array.isArray(response.data.data)) {
    throw new Error('Unexpected SOCO API response');
  }
  return response.data.data;
}

async function upsertProduct(
  prisma: PrismaClient,
  product: SocoProduct,
  taxonomy: Map<string, string>,
): Promise<'created' | 'updated' | 'skipped'> {
  const brand = product.brand?.name?.trim();
  const name = product.name?.trim();
  if (!brand || !name) return 'skipped';

  const { category, subcategory } = resolveCategory(product);
  const slug = slugify(`soco-${brand}-${name}-${product._id.slice(-6)}`);
  const imageUrl = coverImage(product.images);
  const rating = product.review_stats?.average_rating ?? null;
  const reviewCount = product.review_stats?.total_reviews ?? 0;
  const tags = [
    category,
    subcategory,
    ...(product.categories ?? []).map((c) => c.name).filter(Boolean),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const benefits = [
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
      : nameLower.includes('gloss')
        ? 'glossy'
        : 'natural';

  const undertoneMatch =
    nameLower.includes('warm') || nameLower.includes('peach') || nameLower.includes('coral') || nameLower.includes('sand') || nameLower.includes('beige')
      ? 'warm'
      : nameLower.includes('cool') || nameLower.includes('rose') || nameLower.includes('berry') || nameLower.includes('pink') || nameLower.includes('plum')
        ? 'cool'
        : 'universal';

  const suitableUndertones = undertoneMatch === 'warm'
    ? ['Warm', 'Neutral']
    : undertoneMatch === 'cool'
      ? ['Cool', 'Neutral']
      : ['Warm', 'Cool', 'Neutral'];

  const suitableSkinTones = nameLower.includes('fair') || nameLower.includes('light') || nameLower.includes('ivory') || nameLower.includes('porcelain')
    ? ['Fair', 'Light']
    : nameLower.includes('tan') || nameLower.includes('deep') || nameLower.includes('caramel') || nameLower.includes('honey') || nameLower.includes('espresso') || nameLower.includes('dark')
      ? ['Tan', 'Deep']
      : ['Light', 'Medium', 'Tan'];

  const shadeMatch = name.match(/(?:shade|no\.?|#)\s*([0-9a-z\s-]+)/i) || name.match(/-\s*([0-9a-z\s]+)$/i);
  const shade = shadeMatch ? shadeMatch[1].trim() : subcategory;

  const data = {
    socoId: product._id,
    brand,
    name,
    slug,
    description: buildDescription(product, category, subcategory),
    imageUrl,
    category,
    subcategory,
    shade,
    finish,
    undertoneMatch,
    suitableSkinTones,
    suitableUndertones,
    usage: 'Follow brand packaging / official SOCO product page for application tips.',
    benefits,
    tags: [...tags, finish, undertoneMatch],
    rating,
    reviewCount,
    minPrice: product.min_price ?? null,
    maxPrice: product.max_price ?? null,
    // `price`/`originalPrice` power the frontend's single-number display — derive from SOCO's min/max range.
    price: product.min_price ?? product.max_price ?? 0,
    originalPrice: product.max_price && product.max_price !== product.min_price ? product.max_price : null,
    sourceUrl,
    affiliateUrl: product.url_sociolla ?? sourceUrl,
    isActive: true,
  };

  const existing = await prisma.product.findUnique({ where: { socoId: product._id } });
  const saved = existing
    ? await prisma.product.update({ where: { socoId: product._id }, data })
    : await prisma.product.create({ data });

  const typeIds = mapMakeupTypeIds(subcategory, taxonomy);
  await prisma.productIngredient.deleteMany({ where: { productId: saved.id } });
  if (typeIds.length > 0) {
    await prisma.productIngredient.createMany({
      data: typeIds.map((ingredientId) => ({ productId: saved.id, ingredientId })),
      skipDuplicates: true,
    });
  }

  return existing ? 'updated' : 'created';
}

/**
 * Seed / refresh makeup catalog from SOCO Terlaris (category Makeup).
 */
export async function seedMakeupFromSoco(
  prisma: PrismaClient,
  options: SeedMakeupOptions = {},
): Promise<SeedMakeupResult> {
  const limit = options.limit ?? 100;
  const skip = options.skip ?? 0;
  const replace = options.replace ?? false;
  const dryRun = options.dryRun ?? false;

  // eslint-disable-next-line no-console
  console.log(
    `Seeding makeup from SOCO (https://review.soco.id/category/1/makeup) limit=${limit} replace=${replace}`,
  );

  if (replace && !dryRun) {
    // Only clean up existing SOCO scraped products — never touch local dataset CSV products
    await prisma.product.deleteMany({ where: { socoId: { not: null } } });
    // eslint-disable-next-line no-console
    console.log('Cleared existing SOCO scraped products (local dataset products preserved)');
  }

  const taxonomyRows = await prisma.ingredient.findMany({ select: { id: true, name: true } });
  const taxonomy = new Map(taxonomyRows.map((r) => [r.name.toLowerCase(), r.id]));

  let fetched = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let cursor = skip;

  while (fetched < limit) {
    const pageLimit = Math.min(PAGE_SIZE, limit - fetched);
    // eslint-disable-next-line no-console
    console.log(`  fetching SOCO page skip=${cursor} limit=${pageLimit}...`);
    const page = await fetchPage(cursor, pageLimit);
    if (page.length === 0) break;

    for (const product of page) {
      if (dryRun) {
        skipped += 1;
        continue;
      }
      const result = await upsertProduct(prisma, product, taxonomy);
      if (result === 'created') created += 1;
      else if (result === 'updated') updated += 1;
      else skipped += 1;
    }

    fetched += page.length;
    cursor += page.length;
    if (page.length < pageLimit) break;
    await sleep(DELAY_MS);
  }

  const makeupProducts = await prisma.product.count({ where: { isActive: true } });
  return { fetched, created, updated, skipped, makeupProducts };
}
