import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional().nullable(),
  age: z.number().int().min(13).max(120).optional().nullable(),
  budgetMax: z.number().int().min(0).max(50_000_000).optional().nullable(),
  favoriteBrands: z.array(z.string().min(1).max(80)).max(30).optional(),
  occasion: z.enum(['DAILY', 'WORK', 'PARTY', 'WEDDING', 'CASUAL']).optional().nullable(),
  finishPreference: z.enum(['MATTE', 'NATURAL', 'DEWY', 'GLOSSY']).optional().nullable(),
  preferredCategories: z.array(z.string().min(1).max(40)).max(10).optional(),
  allergies: z.array(z.string().min(1).max(80)).max(50).optional(),
  currentProducts: z.array(z.string().min(1).max(120)).max(50).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const generateRecommendationSchema = z.object({
  scanId: z.string().uuid(),
});

export type GenerateRecommendationInput = z.infer<typeof generateRecommendationSchema>;
