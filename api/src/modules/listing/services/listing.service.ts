import { NotFoundError } from '../../../shared/errors/app-error.js';
import type {
  CreateListingInput,
  IListingRepository,
  ListingDto,
  UpdateListingInput,
} from '../interfaces/listing.repository.interface.js';

export class ListingService {
  constructor(private readonly listingRepository: IListingRepository) {}

  list(affiliatorId: string): Promise<ListingDto[]> {
    return this.listingRepository.findAllForAffiliator(affiliatorId);
  }

  create(affiliatorId: string, data: CreateListingInput): Promise<ListingDto> {
    return this.listingRepository.create(affiliatorId, data);
  }

  autoFill(affiliatorId: string, productIds: string[]): Promise<ListingDto[]> {
    return this.listingRepository.createMany(affiliatorId, productIds);
  }

  async update(id: string, affiliatorId: string, data: UpdateListingInput): Promise<ListingDto> {
    const existing = await this.listingRepository.findByIdForAffiliator(id, affiliatorId);
    if (!existing) throw new NotFoundError('Listing not found');
    return this.listingRepository.update(id, data);
  }

  async delete(id: string, affiliatorId: string): Promise<void> {
    const existing = await this.listingRepository.findByIdForAffiliator(id, affiliatorId);
    if (!existing) throw new NotFoundError('Listing not found');
    await this.listingRepository.delete(id);
  }
}
