import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
import { sendSuccess } from '../../shared/utils/api-response.js';
import type { Request, Response } from 'express';
import type { IHistoryRepository } from '../scan/repositories/scan.repository.js';

export class HistoryService {
  constructor(private readonly historyRepository: IHistoryRepository) {}

  async list(userId: string) {
    const rows = await this.historyRepository.listByUserId(userId);
    return rows.map((row) => ({
      id: row.id,
      scanId: row.scanId,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
      analysis: {
        skinTone: row.scan.skinTone,
        undertone: row.scan.undertone,
        faceShape: row.scan.faceShape,
        confidence: row.scan.confidence,
      },
    }));
  }
}

export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const history = await this.historyService.list(req.user.id);
    sendSuccess(res, history);
  };
}

export interface HistoryModuleDeps {
  historyRepository: IHistoryRepository;
}

export function createHistoryModule(deps: HistoryModuleDeps): Router {
  const service = new HistoryService(deps.historyRepository);
  const controller = new HistoryController(service);
  const router = Router();
  router.get('/', authenticate, asyncHandler(controller.list));
  return router;
}
