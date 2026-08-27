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
  face_shape: z.enum(['Oval', 'Round', 'Square', 'Heart', 'Diamond']),
  confidence: z.number().min(0).max(1),
});

export type AiPrediction = z.infer<typeof aiPredictionSchema>;

/**
 * Raw shape returned by the face-analysis ML service.
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

const SKIN_TONE_ALIASES: Record<string, string> = {
  'Very Light': 'Fair',
};

const FACE_SHAPE_ALIASES: Record<string, string> = {
  'Hati (Heart)': 'Heart',
  'Bulat (Round)': 'Round',
  'Persegi (Square)': 'Square',
  'Lonjong (Oblong)': 'Oval',
};

const PLACEHOLDER_CONFIDENCE = 0.88;

export interface IAiClient {
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

  /**
   * Gemini Vision multimodal analyzer fallback for high availability.
   */
  private async predictWithGeminiVision(imageBuffer: Buffer, mimeType: string): Promise<AiPrediction> {
    if (!appConfig.gemini.apiKey) {
      throw new AiServiceError('Neither ML service nor Gemini API key is configured');
    }

    const started = Date.now();
    const base64Image = imageBuffer.toString('base64');
    const prompt = `You are a certified professional Beauty and Color Consultant for Indonesian and Asian skin tones.
Analyze the human face in this photo for personalized makeup and cosmetic matching.

Classify the following strictly according to these standard categories:
1. "skin_tone": strictly choose one from ["Fair", "Light", "Medium", "Tan", "Deep"]
2. "undertone": strictly choose one from ["Warm", "Cool", "Neutral"]
3. "face_shape": strictly choose one from ["Oval", "Round", "Square", "Heart", "Diamond"]
4. "confidence": estimate a float between 0.80 and 0.98

If no human face is detected in the image, return JSON: {"error": "NO_FACE_DETECTED"}

Return valid JSON adhering strictly to this schema:
{
  "skin_tone": "Fair" | "Light" | "Medium" | "Tan" | "Deep",
  "undertone": "Warm" | "Cool" | "Neutral",
  "face_shape": "Oval" | "Round" | "Square" | "Heart" | "Diamond",
  "confidence": number
}`;

    const modelName = appConfig.gemini.model || 'gemini-3.5-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    const payload = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType || 'image/jpeg',
                data: base64Image,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: 'application/json',
      },
    };

    const response = await axios.post(url, payload, {
      headers: {
        'x-goog-api-key': appConfig.gemini.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 20_000,
    });

    const candidate = response.data?.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new AiServiceError('Gemini Vision returned an empty response');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new AiServiceError('Gemini Vision returned malformed JSON');
    }

    if (parsed.error === 'NO_FACE_DETECTED') {
      throw new UnprocessableError('Wajah tidak terdeteksi pada gambar');
    }

    const validated = aiPredictionSchema.safeParse({
      skin_tone: SKIN_TONE_ALIASES[parsed.skin_tone] ?? parsed.skin_tone,
      undertone: parsed.undertone,
      face_shape: FACE_SHAPE_ALIASES[parsed.face_shape] ?? parsed.face_shape,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : PLACEHOLDER_CONFIDENCE,
    });

    if (!validated.success) {
      logger.error('Gemini Vision returned unparseable fields', { issues: validated.error.issues, parsed });
      throw new AiServiceError('Gemini Vision returned invalid schema', validated.error.issues);
    }

    logger.info('AI beauty analysis completed via Gemini Vision', {
      durationMs: Date.now() - started,
      skinTone: validated.data.skin_tone,
      undertone: validated.data.undertone,
      faceShape: validated.data.face_shape,
      confidence: validated.data.confidence,
    });

    return validated.data;
  }

  async predict(image: Buffer | string, mimeType: string): Promise<AiPrediction> {
    const started = Date.now();
    let imageBuffer: Buffer;
    if (typeof image === 'string') {
      try {
        imageBuffer = fs.readFileSync(image);
      } catch {
        imageBuffer = Buffer.from('');
      }
    } else {
      imageBuffer = image;
    }

    // 1. If Python ML service is configured and not default unroutable localhost, try it
    const isLocalhostOnServerless =
      process.env.VERCEL &&
      (appConfig.ai.baseUrl.includes('localhost') || appConfig.ai.baseUrl.includes('127.0.0.1'));

    if (!isLocalhostOnServerless) {
      const form = new FormData();
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
        if (rawParsed.success && rawParsed.data.success) {
          const skinTone = rawParsed.data.skintone.category;
          const faceShape = rawParsed.data.face_shape.shape;
          const parsed = aiPredictionSchema.safeParse({
            skin_tone: SKIN_TONE_ALIASES[skinTone] ?? skinTone,
            undertone: rawParsed.data.undertone.undertone,
            face_shape: FACE_SHAPE_ALIASES[faceShape] ?? faceShape,
            confidence: PLACEHOLDER_CONFIDENCE,
          });
          if (parsed.success) {
            logger.info('AI beauty analysis completed via Python ML Service', {
              durationMs: Date.now() - started,
              skinTone: parsed.data.skin_tone,
              undertone: parsed.data.undertone,
              faceShape: parsed.data.face_shape,
              confidence: parsed.data.confidence,
            });
            return parsed.data;
          }
        }
      } catch (error) {
        logger.warn('Python ML service unreachable or failed, switching to Gemini Vision fallback', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    // 2. High-availability fallback / primary cloud engine: Gemini Vision
    try {
      return await this.predictWithGeminiVision(imageBuffer, mimeType);
    } catch (fallbackError) {
      if (fallbackError instanceof AppError) {
        throw fallbackError;
      }
      logger.error('All AI analysis engines failed', {
        error: fallbackError instanceof Error ? fallbackError.message : 'unknown',
      });
      throw new AiServiceError('Gagal memproses analisis wajah dengan AI');
    }
  }
}
