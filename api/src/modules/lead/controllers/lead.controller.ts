import type { Request, Response } from 'express';
import { z } from 'zod';
import { UnauthorizedError, ValidationError } from '../../../shared/errors/app-error.js';
import { sendCreated, sendSuccess } from '../../../shared/utils/api-response.js';
import type { LeadService } from '../services/lead.service.js';

export const recordClickSchema = z.object({
  leadId: z.string().uuid().optional(),
  listingId: z.string().uuid(),
});

export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  submit = async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.body.slug ?? '').trim();
    if (!slug) throw new ValidationError('slug is required');
    if (!req.file) throw new ValidationError('Image file is required (field name: image)');

    const result = await this.leadService.submitPublicScan({
      slug,
      imageBuffer: req.file.buffer,
      mimetype: req.file.mimetype,
      followerName: req.body.followerName || undefined,
      followerHandle: req.body.followerHandle || undefined,
      email: req.body.email || undefined,
      location: req.body.location || undefined,
      skinPref: req.body.skinPref || undefined,
      finishPref: req.body.finishPref || undefined,
      budgetPref: req.body.budgetPref || undefined,
    });
    sendCreated(res, result);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const leads = await this.leadService.listForAffiliator(req.affiliatorId as string);
    sendSuccess(res, leads, 200, { count: leads.length });
  };

  recordClick = async (req: Request, res: Response): Promise<void> => {
    const { leadId, listingId } = req.body as { leadId?: string; listingId: string };
    await this.leadService.recordClick(leadId, listingId);
    sendSuccess(res, { message: 'Click recorded' });
  };

  updateProfile = async (req: Request, res: Response): Promise<void> => {
    const leadId = String(req.params.id || req.body.leadId || '');
    if (!leadId) throw new ValidationError('leadId is required');
    const updated = await this.leadService.updateLeadProfile(leadId, {
      followerName: req.body.followerName,
      followerHandle: req.body.followerHandle,
      email: req.body.email,
      age: req.body.age,
    });
    sendSuccess(res, updated);
  };
}
