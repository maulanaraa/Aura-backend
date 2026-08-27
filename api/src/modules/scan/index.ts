import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { handleMulterError, uploadScanImage } from '../../middlewares/index.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import type { IAiClient } from '../../shared/services/ai-client.js';
import type { RecommendationService } from '../recommendation/services/recommendation.service.js';
import type { PreferenceReader } from './services/scan.service.js';
import { ScanController } from './controllers/scan.controller.js';
import type { IHistoryRepository, IScanRepository } from './repositories/scan.repository.js';
import { ScanService } from './services/scan.service.js';

export interface ScanModuleDeps {
  aiClient: IAiClient;
  scanRepository: IScanRepository;
  historyRepository: IHistoryRepository;
  recommendationService: RecommendationService;
  preferenceReader?: PreferenceReader;
}

export function createScanModule(deps: ScanModuleDeps): Router {
  const service = new ScanService(
    deps.aiClient,
    deps.scanRepository,
    deps.historyRepository,
    deps.recommendationService,
    deps.preferenceReader,
  );
  const controller = new ScanController(service);
  const router = Router();

  router.post(
    '/',
    authenticate,
    (req, res, next) => {
      uploadScanImage(req, res, (err: unknown) => {
        if (err) {
          handleMulterError(err, req, res, next);
          return;
        }
        next();
      });
    },
    asyncHandler(controller.create),
  );

  return router;
}
