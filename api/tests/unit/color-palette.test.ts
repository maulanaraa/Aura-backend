import { describe, expect, it } from 'vitest';
import { resolveColorPalette } from '@/modules/recommendation/engine/color-palette.js';

describe('resolveColorPalette', () => {
  it('extracts up to 4 distinct color swatches in field order, mapped to hex', () => {
    // Real Spring/Warm/Fair row from dataset\data\shade_mapping.csv
    const palette = resolveColorPalette({
      recommendedJewelryColor: 'Gold',
      recommendedBlushColor: 'Peach, coral, apricot',
      recommendedEyeshadowPalette: 'Champagne, warm beige, gold, peach',
      recommendedLipColor: 'Peach coral, warm pink, bright nude',
    });

    expect(palette).toHaveLength(4);
    expect(palette.map((s) => s.name)).toEqual(['Gold', 'Peach', 'coral', 'apricot']);
    expect(palette[0].colorHex).toBe('#D4AF37'); // Gold
    expect(palette[1].colorHex).toBe('#FFCBA4'); // Peach
    expect(palette[2].colorHex).toBe('#FF7F50'); // coral
    expect(palette[3].colorHex).toBe('#FBCEB1'); // apricot
  });

  it('deduplicates repeated color phrases (case-insensitive)', () => {
    const palette = resolveColorPalette({
      recommendedJewelryColor: 'Silver',
      recommendedBlushColor: 'Silver',
      recommendedEyeshadowPalette: 'silver, Taupe',
      recommendedLipColor: 'Rose',
    });

    const names = palette.map((s) => s.name.toLowerCase());
    expect(names.filter((n) => n === 'silver')).toHaveLength(1);
  });

  it('falls back to neutral gray for an unrecognized color phrase', () => {
    const palette = resolveColorPalette({
      recommendedJewelryColor: 'Bioluminescent Teal',
      recommendedBlushColor: '',
      recommendedEyeshadowPalette: '',
      recommendedLipColor: '',
    });

    expect(palette[0].colorHex).toBe('#9CA3AF');
  });

  it('ignores empty phrases from blank fields', () => {
    const palette = resolveColorPalette({
      recommendedJewelryColor: 'Gold',
      recommendedBlushColor: '',
      recommendedEyeshadowPalette: '',
      recommendedLipColor: '',
    });

    expect(palette).toHaveLength(1);
    expect(palette[0].name).toBe('Gold');
  });
});
