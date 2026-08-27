import { describe, expect, it } from 'vitest';
import { aiPredictionSchema } from '@/shared/services/ai-client.js';

describe('aiPredictionSchema (beauty analysis)', () => {
  it('accepts a valid AURA AI payload', () => {
    const parsed = aiPredictionSchema.parse({
      skin_tone: 'Light',
      undertone: 'Warm',
      face_shape: 'Oval',
      confidence: 0.91,
    });
    expect(parsed.skin_tone).toBe('Light');
    expect(parsed.undertone).toBe('Warm');
  });

  it('rejects legacy skincare payload', () => {
    expect(() =>
      aiPredictionSchema.parse({
        skin_type: 'Oily',
        acne: 82,
        oiliness: 70,
        redness: 25,
        confidence: 0.91,
      }),
    ).toThrow();
  });
});
