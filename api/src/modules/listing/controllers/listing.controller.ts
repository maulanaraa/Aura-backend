import type { Request, Response } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';
import { sendCreated, sendSuccess } from '../../../shared/utils/api-response.js';
import type { ListingService } from '../services/listing.service.js';

export const createListingSchema = z.object({
  productId: z.string().uuid(),
  affiliateUrl: z.string().url(),
  priceOverride: z.number().int().positive().optional(),
  shadeOverride: z.string().max(200).optional(),
  matchScoreWeight: z.number().int().min(0).max(100).optional(),
  affiliatorNote: z.string().max(500).optional(),
});

export const autoFillSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(100),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const updateListingSchema = z.object({
  affiliateUrl: z.string().url().optional(),
  priceOverride: z.number().int().positive().optional(),
  shadeOverride: z.string().max(200).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'OUT_OF_STOCK']).optional(),
  matchScoreWeight: z.number().int().min(0).max(100).optional(),
  affiliatorNote: z.string().max(500).optional(),
});

export class ListingController {
  constructor(private readonly listingService: ListingService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const listings = await this.listingService.list(req.affiliatorId as string);
    sendSuccess(res, listings, 200, { count: listings.length });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const listing = await this.listingService.create(req.affiliatorId as string, req.body);
    sendCreated(res, listing);
  };

  autoFill = async (req: Request, res: Response): Promise<void> => {
    const listings = await this.listingService.autoFill(
      req.affiliatorId as string,
      req.body.productIds,
    );
    sendCreated(res, listings);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const listing = await this.listingService.update(
      String(req.params.id),
      req.affiliatorId as string,
      req.body,
    );
    sendSuccess(res, listing);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.listingService.delete(String(req.params.id), req.affiliatorId as string);
    sendSuccess(res, { message: 'Listing removed' });
  };
}
