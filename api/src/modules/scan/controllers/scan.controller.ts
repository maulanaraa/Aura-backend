import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';
import { sendCreated } from '../../../shared/utils/api-response.js';
import type { ScanService } from '../services/scan.service.js';

export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const result = await this.scanService.performScan(req.user.id, req.file);
    sendCreated(res, result);
  };
}
