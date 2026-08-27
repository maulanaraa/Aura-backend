import { describe, expect, it } from 'vitest';
import {
  derivePersonalColor,
  normalizeSkinTone,
  normalizeUndertone,
} from '@/modules/recommendation/engine/dataset-rule-engine.js';

describe('normalizeUndertone', () => {
  it('passes through dataset-covered values unchanged', () => {
    expect(normalizeUndertone('Warm')).toBe('Warm');
    expect(normalizeUndertone('Cool')).toBe('Cool');
  });

  it('buckets frontend-only values with no dataset coverage', () => {
    expect(normalizeUndertone('Neutral')).toBe('Cool');
    expect(normalizeUndertone('Olive')).toBe('Warm');
  });
});

describe('normalizeSkinTone', () => {
  it('passes through dataset-covered values unchanged', () => {
    expect(normalizeSkinTone('Fair')).toBe('Fair');
    expect(normalizeSkinTone('Light')).toBe('Light');
    expect(normalizeSkinTone('Medium')).toBe('Medium');
    expect(normalizeSkinTone('Tan')).toBe('Tan');
    expect(normalizeSkinTone('Deep')).toBe('Deep');
  });

  it('maps "Rich Deep" (frontend-only, no dataset coverage) down to "Deep"', () => {
    expect(normalizeSkinTone('Rich Deep')).toBe('Deep');
  });

  it('falls back to "Medium" for any other unrecognized value', () => {
    expect(normalizeSkinTone('Unknown')).toBe('Medium');
  });
});

describe('derivePersonalColor', () => {
  it('maps Warm + fair-to-medium skin tones to Spring', () => {
    expect(derivePersonalColor('Fair', 'Warm')).toBe('Spring');
    expect(derivePersonalColor('Light', 'Warm')).toBe('Spring');
    expect(derivePersonalColor('Medium', 'Warm')).toBe('Spring');
  });

  it('maps Warm + tan/deep skin tones to Autumn', () => {
    expect(derivePersonalColor('Tan', 'Warm')).toBe('Autumn');
    expect(derivePersonalColor('Deep', 'Warm')).toBe('Autumn');
  });

  it('maps Cool + fair-to-medium skin tones to Summer', () => {
    expect(derivePersonalColor('Fair', 'Cool')).toBe('Summer');
    expect(derivePersonalColor('Medium', 'Cool')).toBe('Summer');
  });

  it('maps Cool + tan/deep skin tones to Winter', () => {
    expect(derivePersonalColor('Tan', 'Cool')).toBe('Winter');
    expect(derivePersonalColor('Deep', 'Cool')).toBe('Winter');
  });

  it('applies the documented fallback buckets for Neutral/Olive/Rich Deep', () => {
    // Neutral -> Cool bucket
    expect(derivePersonalColor('Fair', 'Neutral')).toBe('Summer');
    // Olive -> Warm bucket
    expect(derivePersonalColor('Deep', 'Olive')).toBe('Autumn');
    // Rich Deep -> Deep bucket
    expect(derivePersonalColor('Rich Deep', 'Warm')).toBe('Autumn');
    expect(derivePersonalColor('Rich Deep', 'Cool')).toBe('Winter');
  });

  it('is deterministic — never AI-sourced, same inputs always produce the same output', () => {
    const first = derivePersonalColor('Medium', 'Warm');
    const second = derivePersonalColor('Medium', 'Warm');
    expect(first).toBe(second);
  });
});
