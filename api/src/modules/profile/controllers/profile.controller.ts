import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';
import { sendSuccess } from '../../../shared/utils/api-response.js';
import type { ProfileService } from '../services/profile.service.js';
import type { UpdateProfileInput } from '../validators/profile.validator.js';

export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  get = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const profile = await this.profileService.getByUserId(req.user.id);
    sendSuccess(res, profile);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const profile = await this.profileService.update(
      req.user.id,
      req.body as UpdateProfileInput,
    );
    sendSuccess(res, profile);
  };
}
