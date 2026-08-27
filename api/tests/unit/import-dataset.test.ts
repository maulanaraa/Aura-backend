import { describe, expect, it } from 'vitest';
import { mapProductRow, type ProductRow } from '../../scripts/import-dataset.js';

// Real row from dataset\data\products.csv
const baseRow: ProductRow = {
  product_id: 'PID0001',
  brand: 'Wardah',
  product_name: 'Wardah Colorfit Matte Foundation',
  category: 'Foundation',
  shade_name: '22N Light Ivory',
  shade_code: '22N',
  finish: 'Natural matte',
  coverage: 'Medium to full',
  skin_type: 'Normal to oily',
  price_range: 'Budget',
  image_url: 'https://placeholder.aura.ai/images/wardah-colorfit-matte-foundation.jpg',
  official_url: 'https://www.wardahbeauty.com/id/product/make-up/wardah-colorfit-matte-foundation',
};

describe('mapProductRow', () => {
  it('maps category to {category, mainCategory} via CATEGORY_MAP', () => {
    const data = mapProductRow(baseRow);
    expect(data.category).toBe('Foundation');
    expect(data.mainCategory).toBe('Face & Shade');
  });

  it('renames Blush -> "Blush & Cheek Tint" to match the frontend union', () => {
    const data = mapProductRow({ ...baseRow, category: 'Blush' });
    expect(data.category).toBe('Blush & Cheek Tint');
    expect(data.mainCategory).toBe('Face & Shade');
  });

  it('buckets Lipstick under the Lips main category', () => {
    const data = mapProductRow({ ...baseRow, category: 'Lipstick' });
    expect(data.category).toBe('Lipstick');
    expect(data.mainCategory).toBe('Lips');
  });

  it('throws on an unrecognized category rather than silently importing bad data', () => {
    expect(() => mapProductRow({ ...baseRow, category: 'Mascara' })).toThrow(/Unknown products.csv category/);
  });

  it('maps price_range buckets to synthetic IDR prices, with originalPrice ~12% higher', () => {
    expect(mapProductRow({ ...baseRow, price_range: 'Budget' }).price).toBe(65000);
    expect(mapProductRow({ ...baseRow, price_range: 'Mid' }).price).toBe(165000);
    expect(mapProductRow({ ...baseRow, price_range: 'Premium' }).price).toBe(350000);

    const data = mapProductRow({ ...baseRow, price_range: 'Budget' });
    expect(data.originalPrice).toBeGreaterThan(data.price);
  });

  it('throws on an unrecognized price_range', () => {
    expect(() => mapProductRow({ ...baseRow, price_range: 'Luxury' })).toThrow(/Unknown products.csv price_range/);
  });

  it('maps skin_type free text to a SkinType[] array', () => {
    expect(mapProductRow({ ...baseRow, skin_type: 'All skin types' }).suitableSkinTypes).toEqual([
      'Oily',
      'Dry',
      'Combination',
      'Normal',
      'Sensitive',
    ]);
    expect(mapProductRow({ ...baseRow, skin_type: 'Normal to oily' }).suitableSkinTypes).toEqual(['Normal', 'Oily']);
  });

  it('throws on an unrecognized skin_type', () => {
    expect(() => mapProductRow({ ...baseRow, skin_type: 'Sensitive only' })).toThrow(/Unknown products.csv skin_type/);
  });

  it('builds a slug that includes shade_code so same-name, different-shade rows stay unique', () => {
    const shadeA = mapProductRow({ ...baseRow, shade_code: '22N' }).slug;
    const shadeB = mapProductRow({ ...baseRow, shade_code: '23N' }).slug;
    expect(shadeA).not.toBe(shadeB);
    expect(shadeA).toContain('22n');
    expect(shadeB).toContain('23n');
  });

  it('synthesizes a non-empty description (required, non-nullable in the DB)', () => {
    const data = mapProductRow(baseRow);
    expect(data.description.length).toBeGreaterThan(0);
    expect(data.description).toContain(baseRow.brand);
    expect(data.description).toContain(baseRow.shade_name);
  });

  it('carries official_url through as both sourceUrl and the default affiliateUrl', () => {
    const data = mapProductRow(baseRow);
    expect(data.sourceUrl).toBe(baseRow.official_url);
    expect(data.affiliateUrl).toBe(baseRow.official_url);
  });
});
