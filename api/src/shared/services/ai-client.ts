import axios, { type AxiosInstance, isAxiosError } from 'axios';
import FormData from 'form-data';
import fs from 'node:fs';
import { z } from 'zod';
import { appConfig } from '../../config/index.js';
import { AiServiceError, AppError, UnprocessableError } from '../errors/app-error.js';
import { logger } from '../utils/logger.js';

/**
 * AURA AI contract (PRD Feature 1).
 * Backend NEVER performs inference — only orchestrates.
 */
export const aiPredictionSchema = z.object({
  skin_tone: z.enum(['Fair', 'Light', 'Medium', 'Tan', 'Deep']),
  undertone: z.enum(['Warm', 'Cool', 'Neutral']),
  // Kept in sync with the frontend's FaceShape union (src/types/index.ts) and
  // RFC-001 §6 SkinAnalysisResult — the AI service must not return a shape
  // the frontend has no rendering/label for (previously included 'Oblong').
  face_shape: z.enum(['Oval', 'Round', 'Square', 'Heart', 'Diamond']),
  // Fraction 0-1, as returned by the AI service. Callers that expose this to
  // the frontend (e.g. LeadService) must scale to a 0-100 percentage before
  // returning it — the frontend renders `${confidence.toFixed(1)}%` directly.
  confidence: z.number().min(0).max(1),
});

export type AiPrediction = z.infer<typeof aiPredictionSchema>;

/**
 * Raw shape returned by the face-analysis ML service (the sibling
 * `face_analysis_api` FastAPI project's `POST /analyze-face` route — see
 * its `src/pipeline.py` `_build_output()`). Its fields don't match
 * aiPredictionSchema 1:1 (nested objects, different skin-tone labels, no
 * numeric confidence), so `predict()` adapts it below rather than exposing
 * the ML service's internal shape to the rest of the backend.
 */
const rawMlResponseSchema = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      face_shape: z.object({ shape: z.string() }).passthrough(),
      skintone: z.object({ category: z.string() }).passthrough(),
      undertone: z.object({ undertone: z.string() }).passthrough(),
    })
    .passthrough(),
  z
    .object({
      success: z.literal(false),
      error_message: z.string().optional(),
    })
    .passthrough(),
]);

// The ML pipeline's skin-tone classifier has a "Very Light" bucket that the
// product contract doesn't distinguish from "Fair" — collapse it here.
const SKIN_TONE_ALIASES: Record<string, string> = {
  'Very Light': 'Fair',
};

// The ML pipeline's face-shape classifier (face_analysis_pipeline/src/face_shape.py
// label_map) returns bilingual Indonesian/English labels, and includes an
// "Oblong" class the product contract has no rendering for (see aiPredictionSchema
// above) — collapse it into the visually closest supported shape, "Oval".
const FACE_SHAPE_ALIASES: Record<string, string> = {
  'Hati (Heart)': 'Heart',
  'Bulat (Round)': 'Round',
  'Persegi (Square)': 'Square',
  'Lonjong (Oblong)': 'Oval',
};

// The ML pipeline's classifiers (face_analysis_pipeline/src/*.py) are
// threshold-based and only emit qualitative calibration notes, never a
// per-prediction confidence score. Use a fixed mid-range placeholder until
// the ML service exposes a real number.
const PLACEHOLDER_CONFIDENCE = 0.75;

export interface IAiClient {
  /**
   * `image` accepts either an in-memory Buffer (preferred — used by the
   * public /leads scan flow, which never touches local disk) or a file path
   * string (kept for the legacy authenticated /scan flow's disk-based
   * multer upload). Accepting both means neither caller had to be rewired
   * when the leads flow moved to buffer-based uploads for Supabase Storage.
   */
  predict(image: Buffer | string, mimeType: string): Promise<AiPrediction>;
}

export class AiClient implements IAiClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl = appConfig.ai.baseUrl, timeoutMs = appConfig.ai.timeoutMs) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
    });
  }

  async predict(image: Buffer | string, mimeType: string): Promise<AiPrediction> {
    const started = Date.now();
    const form = new FormData();
    // Field name must match the AI service's FastAPI parameter name
    // (`file: UploadFile = File(...)` in face_analysis_api/api.py).
    if (typeof image === 'string') {
      form.append('file', fs.createReadStream(image), {
        contentType: mimeType,
        filename: 'scan.jpg',
      });
    } else {
      form.append('file', image, {
        contentType: mimeType,
        filename: 'scan.jpg',
      });
    }

    try {
      const response = await this.http.post(appConfig.ai.predictPath, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
      });

      const rawParsed = rawMlResponseSchema.safeParse(response.data);
      if (!rawParsed.success) {
        throw new AiServiceError('AI service returned an invalid payload', rawParsed.error.issues);
      }
      if (!rawParsed.data.success) {
        throw new UnprocessableError(rawParsed.data.error_message || 'No face detected in image');
      }

      const skinTone = rawParsed.data.skintone.category;
      const faceShape = rawParsed.data.face_shape.shape;
      const parsed = aiPredictionSchema.safeParse({
        skin_tone: SKIN_TONE_ALIASES[skinTone] ?? skinTone,
        undertone: rawParsed.data.undertone.undertone,
        face_shape: FACE_SHAPE_ALIASES[faceShape] ?? faceShape,
        confidence: PLACEHOLDER_CONFIDENCE,
      });
      if (!parsed.success) {
        throw new AiServiceError('AI service returned an invalid payload', parsed.error.issues);
      }

      logger.info('AI beauty analysis completed', {
        durationMs: Date.now() - started,
        skinTone: parsed.data.skin_tone,
        undertone: parsed.data.undertone,
        faceShape: parsed.data.face_shape,
        confidence: parsed.data.confidence,
      });

      return parsed.data;
    } catch (error) {
      logger.error('AI beauty analysis failed', {
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'unknown',
      });

      if (error instanceof AppError) {
        throw error;
      }

      if (isAxiosError(error)) {
        const status = error.response?.status;
        const rawDetail =
          typeof error.response?.data === 'object' && error.response?.data !== null && 'detail' in error.response.data
            ? (error.response.data as { detail: unknown }).detail
            : undefined;
        // FastAPI validation errors (422) return `detail` as an array of
        // {loc, msg, type} objects rather than a string — stringifying that
        // directly yields "[object Object]", so extract the messages instead.
        const detail =
          typeof rawDetail === 'string'
            ? rawDetail
            : Array.isArray(rawDetail)
              ? rawDetail.map((d) => (d && typeof d === 'object' && 'msg' in d ? String(d.msg) : String(d))).join('; ')
              : error.message;

        if (status === 400) {
          throw new UnprocessableError(detail || 'Invalid image for AI analysis');
        }
        if (status === 404) {
          throw new UnprocessableError(detail || 'Wajah tidak terdeteksi pada gambar');
        }
        if (status === 413) {
          throw new UnprocessableError('Ukuran file foto terlalu besar (maksimal 15 MB)');
        }
        if (status === 415) {
          throw new UnprocessableError('Format file foto tidak didukung. Gunakan format JPG, PNG, atau WEBP');
        }
        if (status === 422) {
          throw new UnprocessableError(detail || 'Wajah tidak terdeteksi atau proporsi foto tidak valid');
        }
        throw new AiServiceError(detail || 'AI service error', { status });
      }

      throw new AiServiceError('Failed to reach AI service');
    }
  }
}
