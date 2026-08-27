import { NotFoundError } from '../../../shared/errors/app-error.js';
import type {
  AIPageDto,
  CreateAIPageInput,
  IAIPageRepository,
  PublicAIPageDto,
  UpdateAIPageInput,
} from '../interfaces/ai-page.repository.interface.js';

export class AIPageService {
  constructor(private readonly aiPageRepository: IAIPageRepository) {}

  list(affiliatorId: string): Promise<AIPageDto[]> {
    return this.aiPageRepository.findAllForAffiliator(affiliatorId);
  }

  create(affiliatorId: string, data: CreateAIPageInput): Promise<AIPageDto> {
    return this.aiPageRepository.create(affiliatorId, data);
  }

  async update(id: string, affiliatorId: string, data: UpdateAIPageInput): Promise<AIPageDto> {
    const existing = await this.aiPageRepository.findByIdForAffiliator(id, affiliatorId);
    if (!existing) throw new NotFoundError('AI page not found');
    return this.aiPageRepository.update(id, data);
  }

  async delete(id: string, affiliatorId: string): Promise<void> {
    const existing = await this.aiPageRepository.findByIdForAffiliator(id, affiliatorId);
    if (!existing) throw new NotFoundError('AI page not found');
    await this.aiPageRepository.delete(id);
  }

  async getPublicBySlug(slug: string): Promise<PublicAIPageDto> {
    const page = await this.aiPageRepository.findPublicBySlug(slug);
    if (!page) throw new NotFoundError('Page not found');
    await this.aiPageRepository.recordPageView(page.id);
    return page;
  }
}
