import type { PrismaClient, Profile } from '@prisma/client';
import type { IProfileRepository } from '../interfaces/profile.repository.interface.js';
import type { UpdateProfileInput } from '../validators/profile.validator.js';

export class ProfileRepository implements IProfileRepository {
  constructor(private readonly db: PrismaClient) {}

  findByUserId(userId: string): Promise<Profile | null> {
    return this.db.profile.findUnique({ where: { userId } });
  }

  upsertForUser(userId: string, data: UpdateProfileInput): Promise<Profile> {
    return this.db.profile.upsert({
      where: { userId },
      create: {
        userId,
        name: data.name ?? null,
        gender: data.gender ?? null,
        age: data.age ?? null,
        budgetMax: data.budgetMax ?? null,
        favoriteBrands: data.favoriteBrands ?? [],
        occasion: data.occasion ?? null,
        finishPreference: data.finishPreference ?? null,
        preferredCategories: data.preferredCategories ?? [],
        allergies: data.allergies ?? [],
        currentProducts: data.currentProducts ?? [],
      },
      update: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.gender !== undefined ? { gender: data.gender } : {}),
        ...(data.age !== undefined ? { age: data.age } : {}),
        ...(data.budgetMax !== undefined ? { budgetMax: data.budgetMax } : {}),
        ...(data.favoriteBrands !== undefined ? { favoriteBrands: data.favoriteBrands } : {}),
        ...(data.occasion !== undefined ? { occasion: data.occasion } : {}),
        ...(data.finishPreference !== undefined
          ? { finishPreference: data.finishPreference }
          : {}),
        ...(data.preferredCategories !== undefined
          ? { preferredCategories: data.preferredCategories }
          : {}),
        ...(data.allergies !== undefined ? { allergies: data.allergies } : {}),
        ...(data.currentProducts !== undefined
          ? { currentProducts: data.currentProducts }
          : {}),
      },
    });
  }
}
