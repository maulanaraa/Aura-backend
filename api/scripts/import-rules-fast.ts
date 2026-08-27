import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();

function parseCsv(filepath: string) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let curr = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(curr.trim());
        curr = '';
      } else {
        curr += char;
      }
    }
    values.push(curr.trim());

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? '';
    });
    return obj;
  });
}

async function run() {
  console.log('Seeding shade mappings and recommendation rules fast...');
  const datasetDir = path.join(process.cwd(), 'dataset', 'data');
  
  // 1. Shade Mappings
  const shadeRows = parseCsv(path.join(datasetDir, 'shade_mapping.csv'));
  console.log(`Found ${shadeRows.length} shade mapping rows`);
  for (const row of shadeRows) {
    await prisma.shadeMapping.upsert({
      where: {
        personalColor_undertone_skinTone: {
          personalColor: row.personal_color,
          undertone: row.undertone,
          skinTone: row.skin_tone,
        }
      },
      update: {
        recommendedFoundationFamily: row.recommended_foundation_family || '',
        recommendedBlushColor: row.recommended_blush_color || '',
        recommendedLipColor: row.recommended_lip_color || '',
        recommendedEyeshadowPalette: row.recommended_eyeshadow_palette || '',
        recommendedJewelryColor: row.recommended_jewelry_color || '',
        recommendedClothingPalette: row.recommended_clothing_palette || '',
        avoidedColors: row.avoided_colors || '',
        notes: row.notes || '',
      },
      create: {
        personalColor: row.personal_color,
        undertone: row.undertone,
        skinTone: row.skin_tone,
        recommendedFoundationFamily: row.recommended_foundation_family || '',
        recommendedBlushColor: row.recommended_blush_color || '',
        recommendedLipColor: row.recommended_lip_color || '',
        recommendedEyeshadowPalette: row.recommended_eyeshadow_palette || '',
        recommendedJewelryColor: row.recommended_jewelry_color || '',
        recommendedClothingPalette: row.recommended_clothing_palette || '',
        avoidedColors: row.avoided_colors || '',
        notes: row.notes || '',
      }
    });
  }
  console.log('Shade mappings seeded successfully!');

  const shadeCount = await prisma.shadeMapping.count();
  console.log(`DB Counts: ShadeMappings=${shadeCount}`);
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
