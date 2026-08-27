import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';
import { sendSuccess } from '../../../shared/utils/api-response.js';
import type { UserService } from '../services/user.service.js';

export class UserController {
  constructor(private readonly userService: UserService) {}

  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const user = await this.userService.getMe(req.user.id);
    sendSuccess(res, user);
  };
}
