import type { Profile } from '@prisma/client';
import type { UpdateProfileInput } from '../validators/profile.validator.js';

export interface IProfileRepository {
  findByUserId(userId: string): Promise<Profile | null>;
  upsertForUser(userId: string, data: UpdateProfileInput): Promise<Profile>;
}
