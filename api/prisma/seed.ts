/**
 * AURA database seed:
 * 1. Makeup taxonomy (Foundation, Concealer, …)
 * 2. Admin user
 * 3. Makeup products from SOCO https://review.soco.id/category/1/makeup
 *
 * Env:
 *   SEED_SOCO_LIMIT=100   (default 100)
 *   SEED_SOCO_REPLACE=1   (replace all products before seed)
 *   SEED_SKIP_SOCO=1      (skip network scrape)
 */
import { PrismaClient, Gender } from '@prisma/client';
import bcrypt from 'bcrypt';
import { MAKEUP_TYPES } from '../src/constants/index.js';
import { seedMakeupFromSoco } from './soco-makeup-seeder.js';

const prisma = new PrismaClient();

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const MAKEUP_TAXONOMY: Array<{
  name: string;
  description: string;
  benefits: string[];
  concerns: string[];
}> = [
  {
    name: MAKEUP_TYPES.FOUNDATION,
    description: 'Base makeup for even skin tone and coverage.',
    benefits: ['Coverage', 'Even tone'],
    concerns: ['skin_tone', 'undertone'],
  },
  {
    name: MAKEUP_TYPES.CONCEALER,
    description: 'Spot coverage for blemishes and dark circles.',
    benefits: ['Spot cover', 'Brighten'],
    concerns: ['skin_tone'],
  },
  {
    name: MAKEUP_TYPES.CUSHION,
    description: 'Lightweight cushion foundation with buildable coverage.',
    benefits: ['Lightweight', 'Natural finish'],
    concerns: ['daily', 'natural'],
  },
  {
    name: MAKEUP_TYPES.POWDER,
    description: 'Setting or loose powder to control shine.',
    benefits: ['Oil control', 'Matte finish'],
    concerns: ['matte'],
  },
  {
    name: MAKEUP_TYPES.BLUSH,
    description: 'Cheek color for healthy flush.',
    benefits: ['Color', 'Dimension'],
    concerns: ['face_shape'],
  },
  {
    name: MAKEUP_TYPES.LIP_CREAM,
    description: 'Long-wear cream lipstick / lip cream.',
    benefits: ['Long wear', 'Pigment'],
    concerns: ['party', 'matte'],
  },
  {
    name: MAKEUP_TYPES.LIP_TINT,
    description: 'Sheer to medium lip tint with a natural finish.',
    benefits: ['Natural look', 'Daily wear'],
    concerns: ['daily', 'natural'],
  },
  {
    name: MAKEUP_TYPES.MASCARA,
    description: 'Lash definition and volume.',
    benefits: ['Volume', 'Definition'],
    concerns: ['eyes'],
  },
  {
    name: MAKEUP_TYPES.EYESHADOW,
    description: 'Eye color for everyday or glam looks.',
    benefits: ['Color', 'Depth'],
    concerns: ['party', 'eyes'],
  },
  {
    name: MAKEUP_TYPES.BROW,
    description: 'Brow pencil / pomade for framed eyes.',
    benefits: ['Shape', 'Definition'],
    concerns: ['face_shape'],
  },
];

async function seedTaxonomy(): Promise<void> {
  for (const item of MAKEUP_TAXONOMY) {
    await prisma.ingredient.upsert({
      where: { slug: slugify(item.name) },
      update: {
        description: item.description,
        benefits: item.benefits,
        concerns: item.concerns,
      },
      create: {
        name: item.name,
        slug: slugify(item.name),
        description: item.description,
        benefits: item.benefits,
        concerns: item.concerns,
      },
    });
  }
}

async function seedAdmin(): Promise<void> {
  const adminEmail = 'admin@auraai.local';
  const adminPasswordHash = await bcrypt.hash('Admin123!', 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      isEmailVerified: true,
      isTwoFactorEnabled: false,
    },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      isEmailVerified: true,
      isTwoFactorEnabled: false,
      profile: {
        create: {
          name: 'Aura Admin',
          gender: Gender.PREFER_NOT_TO_SAY,
          age: 30,
          budgetMax: 300_000,
          favoriteBrands: ['Wardah', 'Emina', 'Maybelline'],
          occasion: 'DAILY',
          finishPreference: 'NATURAL',
          preferredCategories: ['Face', 'Lips'],
          allergies: [],
          currentProducts: [],
        },
      },
    },
  });
}

async function main(): Promise<void> {
  await seedTaxonomy();
  await seedAdmin();
  // eslint-disable-next-line no-console
  console.log(`Seeded makeup taxonomy=${MAKEUP_TAXONOMY.length}, admin=admin@auraai.local`);

  if (process.env.SEED_SKIP_SOCO === '1') {
    // eslint-disable-next-line no-console
    console.log('Skipping SOCO product seed (SEED_SKIP_SOCO=1)');
    return;
  }

  const limit = Number(process.env.SEED_SOCO_LIMIT ?? 100);
  const replace = process.env.SEED_SOCO_REPLACE === '1' || process.env.SEED_SOCO_REPLACE === 'true';

  const result = await seedMakeupFromSoco(prisma, { limit, replace });
  // eslint-disable-next-line no-console
  console.log('SOCO makeup seed result:', result);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
