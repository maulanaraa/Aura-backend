/**
 * CLI: seed / refresh makeup products from SOCO.
 *
 *   npm run seed:makeup
 *   npx tsx scripts/scrape-soco-makeup.ts --limit=100 --replace
 */
import { PrismaClient } from '@prisma/client';
import { seedMakeupFromSoco } from '../prisma/soco-makeup-seeder.js';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): {
  limit: number;
  skip: number;
  dryRun: boolean;
  replace: boolean;
} {
  let limit = 100;
  let skip = 0;
  let dryRun = false;
  let replace = false;

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) limit = Math.max(1, Number(arg.slice('--limit='.length)));
    if (arg.startsWith('--skip=')) skip = Math.max(0, Number(arg.slice('--skip='.length)));
    if (arg === '--dry-run') dryRun = true;
    if (arg === '--replace') replace = true;
  }

  return { limit, skip, dryRun, replace };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const result = await seedMakeupFromSoco(prisma, opts);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
