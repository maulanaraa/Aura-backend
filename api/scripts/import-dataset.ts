/**
 * CLI: import the local curated dataset (dataset\data\*.csv, inside this
 * backend project) into the database.
 *
 * Reads ONLY products.csv, recommendations.csv, shade_mapping.csv — the
 * accompanying aura_seed.sql targets an incompatible legacy schema and the
 * .json mirrors are either redundant or (recommendations.json) empty.
 *
 *   npm run import:dataset
 *   npx tsx scripts/import-dataset.ts --dir=./dataset/data --reset
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { dir: string; reset: boolean } {
  let dir = path.resolve(__dirname, '../dataset/data');
  let reset = false;
  for (const arg of argv) {
    if (arg.startsWith('--dir=')) dir = path.resolve(process.cwd(), arg.slice('--dir='.length));
    if (arg === '--reset') reset = true;
  }
  return { dir, reset };
}

// ---------------------------------------------------------------------------
// CSV row shapes (as parsed, all string columns)
// ---------------------------------------------------------------------------

export interface ProductRow {
  product_id: string;
  brand: string;
  product_name: string;
  category: string;
  shade_name: string;
  shade_code: string;
  finish: string;
  coverage: string;
  skin_type: string;
  price_range: string;
  image_url: string;
  official_url: string;
}

interface RecommendationRow {
  recommendation_id: string;
  personal_color: string;
  undertone: string;
  skin_tone: string;
  category: string;
  product_id: string;
  recommendation_score: string;
  priority: string;
  reason: string;
}

interface ShadeMappingRow {
  personal_color: string;
  undertone: string;
  skin_tone: string;
  recommended_foundation_family: string;
  recommended_blush_color: string;
  recommended_lip_color: string;
  recommended_eyeshadow_palette: string;
  recommended_jewelry_color: string;
  recommended_clothing_palette: string;
  avoided_colors: string;
  notes: string;
}

function readCsv<T>(filePath: string): T[] {
  const raw = readFileSync(filePath, 'utf-8');
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as T[];
}

// ---------------------------------------------------------------------------
// Mapping tables (dataset vocabulary -> frontend vocabulary)
// ---------------------------------------------------------------------------

/** Dataset `category` (6 values) -> frontend {category, mainCategory}. */
const CATEGORY_MAP: Record<string, { category: string; mainCategory: 'Lips' | 'Face & Shade' }> = {
  Foundation: { category: 'Foundation', mainCategory: 'Face & Shade' },
  Concealer: { category: 'Concealer', mainCategory: 'Face & Shade' },
  Cushion: { category: 'Cushion', mainCategory: 'Face & Shade' },
  Blush: { category: 'Blush & Cheek Tint', mainCategory: 'Face & Shade' },
  Eyeshadow: { category: 'Eyeshadow', mainCategory: 'Face & Shade' },
  Lipstick: { category: 'Lipstick', mainCategory: 'Lips' },
};

/**
 * Dataset `price_range` is a bucketed label (Budget/Mid/Premium), not a real
 * price — no price data exists anywhere in the source. These IDR figures are
 * synthetic representative midpoints for local Indonesian drugstore/mid-tier
 * makeup, chosen only so the frontend's required numeric `price` field has a
 * plausible value to render/sort/filter on.
 */
const PRICE_RANGE_TO_IDR: Record<string, number> = {
  Budget: 65000,
  Mid: 165000,
  Premium: 350000,
};

/** Dataset `skin_type` (4 values) -> frontend SkinType[]. */
const SKIN_TYPE_MAP: Record<string, string[]> = {
  'All skin types': ['Oily', 'Dry', 'Combination', 'Normal', 'Sensitive'],
  'Normal to combination': ['Normal', 'Combination'],
  'Normal to dry': ['Normal', 'Dry'],
  'Normal to oily': ['Normal', 'Oily'],
};

/**
 * Every image_url in products.csv is a fake `placeholder.aura.ai` link (no
 * real product photography exists in the dataset). Swap in one representative
 * stock photo per category, reusing the same Unsplash source already used by
 * Frontend-3.0's mockData.ts, so imported rows render something real instead
 * of a broken-image icon. These are explicitly placeholders, not real product
 * photos.
 */
const CATEGORY_IMAGE_MAP: Record<string, string> = {
  Foundation: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&q=80&w=600',
  Concealer: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&q=80&w=600',
  Cushion: 'https://images.unsplash.com/photo-1625093742435-6fa192b6fb10?auto=format&fit=crop&q=80&w=600',
  Blush: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=600',
  Eyeshadow: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=600',
  Lipstick: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&q=80&w=600',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function roundToNearestThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

// ---------------------------------------------------------------------------
// Pure row -> Product-fields transform (exported for unit testing — no DB access)
// ---------------------------------------------------------------------------

export interface MappedProductData {
  brand: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  category: string;
  mainCategory: 'Lips' | 'Face & Shade';
  finish: string;
  shade: string;
  price: number;
  originalPrice: number;
  suitableSkinTypes: string[];
  tags: string[];
  sourceUrl: string;
  affiliateUrl: string;
  isActive: true;
}

export function mapProductRow(row: ProductRow): MappedProductData {
  const mapped = CATEGORY_MAP[row.category];
  if (!mapped) {
    throw new Error(`Unknown products.csv category "${row.category}" for ${row.product_id} — add it to CATEGORY_MAP`);
  }
  const price = PRICE_RANGE_TO_IDR[row.price_range];
  if (price === undefined) {
    throw new Error(`Unknown products.csv price_range "${row.price_range}" for ${row.product_id}`);
  }
  const suitableSkinTypes = SKIN_TYPE_MAP[row.skin_type];
  if (!suitableSkinTypes) {
    throw new Error(`Unknown products.csv skin_type "${row.skin_type}" for ${row.product_id}`);
  }

  const slug = slugify(`${row.brand}-${row.product_name}-${row.shade_code}`);
  const shade = `${row.shade_name} (${row.shade_code})`;
  const description = `${row.brand} ${row.product_name} — shade ${row.shade_name} (${row.shade_code}), ${row.finish} finish, ${row.coverage} coverage. Suitable for ${row.skin_type}.`;

  return {
    brand: row.brand,
    name: row.product_name,
    slug,
    description,
    imageUrl: CATEGORY_IMAGE_MAP[row.category] ?? null,
    category: mapped.category,
    mainCategory: mapped.mainCategory,
    finish: row.finish,
    shade,
    price,
    originalPrice: roundToNearestThousand(price * 1.12),
    suitableSkinTypes,
    tags: [mapped.category, row.finish, row.coverage],
    sourceUrl: row.official_url,
    affiliateUrl: row.official_url,
    isActive: true,
  };
}

// ---------------------------------------------------------------------------
// Pass 1 — Products
// ---------------------------------------------------------------------------

async function importProducts(
  prisma: PrismaClient,
  rows: ProductRow[],
): Promise<{ created: number; updated: number }> {
  const existingDatasetIds = new Set(
    (await prisma.product.findMany({ where: { datasetId: { not: null } }, select: { datasetId: true } })).map(
      (p) => p.datasetId as string,
    ),
  );

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const data = mapProductRow(row);

    await prisma.product.upsert({
      where: { datasetId: row.product_id },
      create: { datasetId: row.product_id, ...data },
      update: data,
    });
    if (existingDatasetIds.has(row.product_id)) updated += 1;
    else created += 1;
  }

  return { created, updated };
}

// ---------------------------------------------------------------------------
// Pass 2 — Recommendation rules + shade mappings
// ---------------------------------------------------------------------------

async function importRecommendationRules(
  prisma: PrismaClient,
  rows: RecommendationRow[],
): Promise<{ created: number; skipped: number }> {
  const products = await prisma.product.findMany({
    where: { datasetId: { not: null } },
    select: { id: true, datasetId: true },
  });
  const productIdByDatasetId = new Map(products.map((p) => [p.datasetId as string, p.id]));

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const productId = productIdByDatasetId.get(row.product_id);
    if (!productId) {
      // eslint-disable-next-line no-console
      console.warn(`recommendations.csv row ${row.recommendation_id} references unknown product_id ${row.product_id} — skipping`);
      skipped += 1;
      continue;
    }

    await prisma.recommendationRule.upsert({
      where: { datasetId: row.recommendation_id },
      create: {
        datasetId: row.recommendation_id,
        personalColor: row.personal_color,
        undertone: row.undertone,
        skinTone: row.skin_tone,
        category: row.category,
        productId,
        recommendationScore: Number(row.recommendation_score),
        priority: Number(row.priority),
        reason: row.reason,
      },
      update: {
        personalColor: row.personal_color,
        undertone: row.undertone,
        skinTone: row.skin_tone,
        category: row.category,
        productId,
        recommendationScore: Number(row.recommendation_score),
        priority: Number(row.priority),
        reason: row.reason,
      },
    });
    created += 1;
  }

  return { created, skipped };
}

async function importShadeMappings(prisma: PrismaClient, rows: ShadeMappingRow[]): Promise<number> {
  for (const row of rows) {
    await prisma.shadeMapping.upsert({
      where: {
        personalColor_undertone_skinTone: {
          personalColor: row.personal_color,
          undertone: row.undertone,
          skinTone: row.skin_tone,
        },
      },
      create: {
        personalColor: row.personal_color,
        undertone: row.undertone,
        skinTone: row.skin_tone,
        recommendedFoundationFamily: row.recommended_foundation_family,
        recommendedBlushColor: row.recommended_blush_color,
        recommendedLipColor: row.recommended_lip_color,
        recommendedEyeshadowPalette: row.recommended_eyeshadow_palette,
        recommendedJewelryColor: row.recommended_jewelry_color,
        recommendedClothingPalette: row.recommended_clothing_palette,
        avoidedColors: row.avoided_colors,
        notes: row.notes,
      },
      update: {
        recommendedFoundationFamily: row.recommended_foundation_family,
        recommendedBlushColor: row.recommended_blush_color,
        recommendedLipColor: row.recommended_lip_color,
        recommendedEyeshadowPalette: row.recommended_eyeshadow_palette,
        recommendedJewelryColor: row.recommended_jewelry_color,
        recommendedClothingPalette: row.recommended_clothing_palette,
        avoidedColors: row.avoided_colors,
        notes: row.notes,
      },
    });
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Pass 3 — Backfill Product.suitableSkinTones / suitableUndertones
// ---------------------------------------------------------------------------

async function backfillProductToneCoverage(prisma: PrismaClient): Promise<number> {
  const rules = await prisma.recommendationRule.findMany({
    select: { productId: true, undertone: true, skinTone: true },
  });

  const undertonesByProduct = new Map<string, Set<string>>();
  const skinTonesByProduct = new Map<string, Set<string>>();
  for (const rule of rules) {
    if (!undertonesByProduct.has(rule.productId)) undertonesByProduct.set(rule.productId, new Set());
    if (!skinTonesByProduct.has(rule.productId)) skinTonesByProduct.set(rule.productId, new Set());
    undertonesByProduct.get(rule.productId)!.add(rule.undertone);
    skinTonesByProduct.get(rule.productId)!.add(rule.skinTone);
  }

  let updated = 0;
  for (const [productId, undertones] of undertonesByProduct) {
    const skinTones = skinTonesByProduct.get(productId) ?? new Set<string>();
    await prisma.product.update({
      where: { id: productId },
      data: {
        suitableUndertones: Array.from(undertones),
        suitableSkinTones: Array.from(skinTones),
      },
    });
    updated += 1;
  }
  return updated;
}

// ---------------------------------------------------------------------------
// --reset
// ---------------------------------------------------------------------------

async function resetDatasetData(prisma: PrismaClient): Promise<void> {
  await prisma.recommendationRule.deleteMany({});
  await prisma.shadeMapping.deleteMany({});
  await prisma.product.deleteMany({ where: { datasetId: { not: null } } });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const { dir, reset } = parseArgs(process.argv.slice(2));

  if (reset) {
    // eslint-disable-next-line no-console
    console.log('Resetting previously imported dataset rows...');
    await resetDatasetData(prisma);
  }

  const productRows = readCsv<ProductRow>(path.join(dir, 'products.csv'));
  const recommendationRows = readCsv<RecommendationRow>(path.join(dir, 'recommendations.csv'));
  const shadeMappingRows = readCsv<ShadeMappingRow>(path.join(dir, 'shade_mapping.csv'));

  // eslint-disable-next-line no-console
  console.log(`Loaded ${productRows.length} products, ${recommendationRows.length} recommendation rules, ${shadeMappingRows.length} shade mappings from ${dir}`);

  const productResult = await importProducts(prisma, productRows);
  // eslint-disable-next-line no-console
  console.log(`Products: created=${productResult.created} updated=${productResult.updated}`);

  const ruleResult = await importRecommendationRules(prisma, recommendationRows);
  // eslint-disable-next-line no-console
  console.log(`Recommendation rules: upserted=${ruleResult.created} skipped=${ruleResult.skipped}`);

  const shadeMappingCount = await importShadeMappings(prisma, shadeMappingRows);
  // eslint-disable-next-line no-console
  console.log(`Shade mappings: upserted=${shadeMappingCount}`);

  const backfillCount = await backfillProductToneCoverage(prisma);
  // eslint-disable-next-line no-console
  console.log(`Backfilled suitableSkinTones/suitableUndertones on ${backfillCount} products`);
}

// Only run the CLI when this file is executed directly (`tsx scripts/import-dataset.ts`) —
// not when it's imported elsewhere (e.g. tests importing mapProductRow), which would otherwise
// trigger a real run against the database as an import side effect.
const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1] as string).href;

if (isMainModule) {
  main()
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
