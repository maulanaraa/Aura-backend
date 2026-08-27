import type { Profile } from '@prisma/client';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import type { BeautyPreferencesInput } from '../../recommendation/engine/rule-engine.js';
import type { ProfileDto } from '../dto/profile.dto.js';
import type { IProfileRepository } from '../interfaces/profile.repository.interface.js';
import type { UpdateProfileInput } from '../validators/profile.validator.js';

function toDto(profile: Profile): ProfileDto {
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.name,
    gender: profile.gender,
    age: profile.age,
    budgetMax: profile.budgetMax,
    favoriteBrands: profile.favoriteBrands,
    occasion: profile.occasion,
    finishPreference: profile.finishPreference,
    preferredCategories: profile.preferredCategories,
    allergies: profile.allergies,
    currentProducts: profile.currentProducts,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export class ProfileService {
  constructor(private readonly profileRepository: IProfileRepository) {}

  async getByUserId(userId: string): Promise<ProfileDto> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundError('Profile not found');
    }
    return toDto(profile);
  }

  async update(userId: string, input: UpdateProfileInput): Promise<ProfileDto> {
    const profile = await this.profileRepository.upsertForUser(userId, input);
    return toDto(profile);
  }

  async getPreferences(userId: string): Promise<BeautyPreferencesInput> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      return {};
    }
    return {
      budgetMax: profile.budgetMax,
      favoriteBrands: profile.favoriteBrands,
      occasion: profile.occasion,
      finishPreference: profile.finishPreference,
      preferredCategories: profile.preferredCategories,
    };
  }
}
