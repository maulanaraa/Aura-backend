import type { Request, Response } from 'express';
import { NotFoundError, UnauthorizedError } from '../../../shared/errors/app-error.js';
import { sendCreated, sendSuccess } from '../../../shared/utils/api-response.js';
import type { IScanRepository } from '../../scan/repositories/scan.repository.js';
import type { ProfileService } from '../../profile/services/profile.service.js';
import type { RecommendationService } from '../services/recommendation.service.js';
import type { GenerateRecommendationInput } from '../../profile/validators/profile.validator.js';

export class RecommendationController {
  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly scanRepository: IScanRepository,
    private readonly profileService: ProfileService,
  ) {}

  latest = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const latest = await this.recommendationService.getLatest(req.user.id);
    sendSuccess(res, latest);
  };

  /**
   * PRD Feature 3: generate Top-5 ranked products from a scan + beauty preferences.
   */
  generate = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const { scanId } = req.body as GenerateRecommendationInput;
    const scan = await this.scanRepository.findByIdForUser(scanId, req.user.id);
    if (!scan) {
      throw new NotFoundError('Scan not found');
    }

    const preferences = await this.profileService.getPreferences(req.user.id);
    const result = await this.recommendationService.generateAndPersist(
      req.user.id,
      scan.id,
      {
        skinTone: scan.skinTone,
        undertone: scan.undertone,
        faceShape: scan.faceShape,
        confidence: scan.confidence,
      },
      preferences,
    );

    sendCreated(res, {
      recommendationId: result.recommendationId,
      scanId: scan.id,
      analysis: {
        skinTone: scan.skinTone,
        undertone: scan.undertone,
        faceShape: scan.faceShape,
        confidence: scan.confidence,
      },
      recommendation: {
        makeupTypes: result.makeupTypes,
        products: result.products,
      },
    });
  };
}
