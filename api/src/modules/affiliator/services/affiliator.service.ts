import type { AffiliatorStatus } from '@prisma/client';
import { generateSecureToken } from '../../../shared/utils/crypto.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import type {
  AffiliatorListFilter,
  AffiliatorProfileDto,
  IAffiliatorRepository,
  UpdateAffiliatorInput,
} from '../interfaces/affiliator.repository.interface.js';

export class AffiliatorService {
  constructor(private readonly affiliatorRepository: IAffiliatorRepository) {}

  async getSelf(userId: string): Promise<AffiliatorProfileDto> {
    const profile = await this.affiliatorRepository.findByUserId(userId);
    if (!profile) throw new NotFoundError('Affiliator profile not found');
    return profile;
  }

  async updateSelf(userId: string, data: UpdateAffiliatorInput): Promise<AffiliatorProfileDto> {
    const profile = await this.getSelf(userId);
    return this.affiliatorRepository.update(profile.id, data);
  }

  async regenerateApiKeyForUser(userId: string): Promise<AffiliatorProfileDto> {
    const profile = await this.getSelf(userId);
    return this.affiliatorRepository.regenerateApiKey(profile.id, `aura_live_${generateSecureToken(24)}`);
  }

  listAll(filter?: AffiliatorListFilter): Promise<AffiliatorProfileDto[]> {
    return this.affiliatorRepository.listAll(filter);
  }

  async getById(id: string): Promise<AffiliatorProfileDto> {
    const profile = await this.affiliatorRepository.findById(id);
    if (!profile) throw new NotFoundError('Affiliator not found');
    return profile;
  }

  async updateStatus(id: string, status: AffiliatorStatus): Promise<AffiliatorProfileDto> {
    await this.getById(id);
    return this.affiliatorRepository.updateStatus(id, status);
  }

  async updateById(id: string, data: UpdateAffiliatorInput): Promise<AffiliatorProfileDto> {
    await this.getById(id);
    return this.affiliatorRepository.update(id, data);
  }

  async deleteById(id: string): Promise<void> {
    await this.getById(id);
    return this.affiliatorRepository.deleteById(id);
  }
}
