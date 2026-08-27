import fs from 'node:fs/promises';
import { ValidationError } from '../../../shared/errors/app-error.js';
import type { IAiClient } from '../../../shared/services/ai-client.js';
import { logger } from '../../../shared/utils/logger.js';
import type { ScanResponseDto } from '../../recommendation/dto/recommendation.dto.js';
import type { RecommendationService } from '../../recommendation/services/recommendation.service.js';
import type { BeautyPreferencesInput } from '../../recommendation/engine/rule-engine.js';
import type { IHistoryRepository, IScanRepository } from '../repositories/scan.repository.js';

export interface ScanUpload {
  path: string;
  mimetype: string;
}

export interface PreferenceReader {
  getPreferences(userId: string): Promise<BeautyPreferencesInput>;
}

/**
 * Scan orchestration (PRD Feature 1 + optional Feature 3):
 * Validate → AI beauty analysis → persist → recommend if preferences exist.
 */
export class ScanService {
  constructor(
    private readonly aiClient: IAiClient,
    private readonly scanRepository: IScanRepository,
    private readonly historyRepository: IHistoryRepository,
    private readonly recommendationService: RecommendationService,
    private readonly preferenceReader?: PreferenceReader,
  ) {}

  async performScan(userId: string, file: ScanUpload | undefined): Promise<ScanResponseDto> {
    if (!file) {
      throw new ValidationError('Image file is required (field name: image)');
    }

    let prediction;
    try {
      prediction = await this.aiClient.predict(file.path, file.mimetype);
    } catch (error) {
      await this.safeUnlink(file.path);
      throw error;
    }

    const scan = await this.scanRepository.create({
      userId,
      imagePath: file.path,
      prediction,
    });

    const analysis = {
      skinTone: prediction.skin_tone,
      undertone: prediction.undertone,
      faceShape: prediction.face_shape,
      confidence: prediction.confidence,
    };

    const summary = `${prediction.skin_tone} · ${prediction.undertone} undertone · ${prediction.face_shape}`;
    await this.historyRepository.create({
      userId,
      scanId: scan.id,
      summary,
    });

    const preferences = this.preferenceReader
      ? await this.preferenceReader.getPreferences(userId)
      : {};

    const hasPreferences =
      preferences.budgetMax != null ||
      (preferences.favoriteBrands?.length ?? 0) > 0 ||
      preferences.occasion != null ||
      preferences.finishPreference != null ||
      (preferences.preferredCategories?.length ?? 0) > 0;

    let response: ScanResponseDto = {
      scanId: scan.id,
      analysis,
    };

    if (hasPreferences) {
      const recommendation = await this.recommendationService.generateAndPersist(
        userId,
        scan.id,
        analysis,
        preferences,
      );
      response = {
        ...response,
        recommendationId: recommendation.recommendationId,
        recommendation: {
          makeupTypes: recommendation.makeupTypes,
          products: recommendation.products,
        },
      };
    }

    logger.info('Beauty scan completed', {
      userId,
      scanId: scan.id,
      ...analysis,
      recommended: Boolean(response.recommendationId),
    });

    return response;
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // best-effort cleanup
    }
  }
}
