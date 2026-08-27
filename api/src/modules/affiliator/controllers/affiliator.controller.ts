import type { Request, Response } from 'express';
import { z } from 'zod';
import { UnauthorizedError, ValidationError } from '../../../shared/errors/app-error.js';
import { sendSuccess } from '../../../shared/utils/api-response.js';
import type { IStorageService } from '../../../shared/services/storage.service.js';
import type { AffiliatorService } from '../services/affiliator.service.js';

export const listAffiliatorsQuerySchema = z.object({
  status: z.enum(['APPROVED', 'PENDING_APPROVAL', 'REJECTED', 'SUSPENDED']).optional(),
  tier: z.enum(['STARTER', 'PRO', 'ELITE']).optional(),
});

const socialPlatformsSchema = z
  .object({
    tiktok: z.string().max(200).optional(),
    instagram: z.string().max(200).optional(),
    youtube: z.string().max(200).optional(),
    ltk: z.string().max(200).optional(),
  })
  .partial();

const notificationsSchema = z
  .object({
    emailDigest: z.boolean(),
    conversionAlerts: z.boolean(),
    weeklyReport: z.boolean(),
    newFeatures: z.boolean(),
  })
  .partial();

export const updateAffiliatorSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  handle: z.string().min(1).max(60).optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(500).optional(),
  niche: z.string().max(120).optional(),
  socialPlatforms: socialPlatformsSchema.optional(),
  tier: z.enum(['STARTER', 'PRO', 'ELITE']).optional(),
  planStatus: z.enum(['ACTIVE', 'TRIALING', 'PAST_DUE']).optional(),
  followersCount: z.string().max(20).optional(),
  notifications: notificationsSchema.optional(),
});

export const updateAffiliatorStatusSchema = z.object({
  status: z.enum(['APPROVED', 'PENDING_APPROVAL', 'REJECTED', 'SUSPENDED']),
});

export class AffiliatorController {
  constructor(
    private readonly affiliatorService: AffiliatorService,
    private readonly storageService: IStorageService,
  ) {}

  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const profile = await this.affiliatorService.getSelf(req.user.id);
    sendSuccess(res, profile);
  };

  updateMe = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const profile = await this.affiliatorService.updateSelf(req.user.id, req.body);
    sendSuccess(res, profile);
  };

  uploadAvatar = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) throw new ValidationError('No image file uploaded');

    const uploaded = await this.storageService.uploadAvatarImage(file.buffer, file.mimetype);
    const profile = await this.affiliatorService.updateSelf(req.user.id, { avatarUrl: uploaded.publicUrl });
    sendSuccess(res, profile);
  };

  regenerateApiKey = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const profile = await this.affiliatorService.regenerateApiKeyForUser(req.user.id);
    sendSuccess(res, profile);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const parsed = listAffiliatorsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    const affiliators = await this.affiliatorService.listAll(parsed.data);
    sendSuccess(res, affiliators, 200, { count: affiliators.length });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const affiliator = await this.affiliatorService.getById(String(req.params.id));
    sendSuccess(res, affiliator);
  };

  updateStatus = async (req: Request, res: Response): Promise<void> => {
    const affiliator = await this.affiliatorService.updateStatus(
      String(req.params.id),
      req.body.status,
    );
    sendSuccess(res, affiliator);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const affiliator = await this.affiliatorService.updateById(String(req.params.id), req.body);
    sendSuccess(res, affiliator);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.affiliatorService.deleteById(String(req.params.id));
    sendSuccess(res, { message: 'Affiliator deleted successfully' });
  };
}
