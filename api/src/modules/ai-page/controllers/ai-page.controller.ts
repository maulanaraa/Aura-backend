import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendCreated, sendSuccess } from '../../../shared/utils/api-response.js';
import type { AIPageService } from '../services/ai-page.service.js';

export const createAIPageSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  title: z.string().min(1).max(120),
  bio: z.string().max(500).optional(),
  welcomeMessage: z.string().max(500).optional(),
  primaryColor: z.string().max(20),
  accentColor: z.string().max(20),
  allowCameraUpload: z.boolean().optional(),
  customDomain: z.string().max(200).optional(),
  featuredListingIds: z.array(z.string().uuid()).max(50).optional(),
});

export const updateAIPageSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  bio: z.string().max(500).optional(),
  welcomeMessage: z.string().max(500).optional(),
  primaryColor: z.string().max(20).optional(),
  accentColor: z.string().max(20).optional(),
  allowCameraUpload: z.boolean().optional(),
  customDomain: z.string().max(200).optional(),
  status: z.enum(['PUBLISHED', 'DRAFT']).optional(),
  featuredListingIds: z.array(z.string().uuid()).max(50).optional(),
});

export class AIPageController {
  constructor(private readonly aiPageService: AIPageService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const pages = await this.aiPageService.list(req.affiliatorId as string);
    sendSuccess(res, pages, 200, { count: pages.length });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const page = await this.aiPageService.create(req.affiliatorId as string, req.body);
    sendCreated(res, page);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const page = await this.aiPageService.update(
      String(req.params.id),
      req.affiliatorId as string,
      req.body,
    );
    sendSuccess(res, page);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.aiPageService.delete(String(req.params.id), req.affiliatorId as string);
    sendSuccess(res, { message: 'Page removed' });
  };

  publicBySlug = async (req: Request, res: Response): Promise<void> => {
    const page = await this.aiPageService.getPublicBySlug(String(req.params.slug));
    sendSuccess(res, page);
  };
}
