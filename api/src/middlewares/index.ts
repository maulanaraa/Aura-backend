import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../config/index.js';
import { ERROR_CODES, HTTP_STATUS } from '../constants/index.js';
import { ValidationError } from '../shared/errors/app-error.js';
import { logger } from '../shared/utils/logger.js';

export const apiRateLimiter = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: appConfig.isProduction ? appConfig.rateLimit.max : 50000,
  skip: () => !appConfig.isProduction,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many requests, please try again later',
    },
  },
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
});

const uploadRoot = path.resolve(process.cwd(), appConfig.upload.dir);
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadRoot);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

function imageFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
  if (!allowed.has(file.mimetype)) {
    cb(new ValidationError('Only JPEG, PNG, or WebP images are allowed'));
    return;
  }
  cb(null, true);
}

export const uploadScanImage: RequestHandler = multer({
  storage,
  limits: { fileSize: appConfig.upload.maxBytes, files: 1 },
  fileFilter: imageFileFilter,
}).single('image');

/**
 * Memory-buffered variant used by the public `/leads` scan flow, whose
 * `IStorageService` (Supabase Storage or local fallback — see
 * shared/services/) is responsible for persisting the bytes, not multer
 * itself. Deliberately separate from `uploadScanImage` above (which still
 * writes straight to local disk) so the legacy authenticated `/scan` route
 * — untouched by this refactor — keeps working exactly as before.
 */
export const uploadScanImageToMemory: RequestHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: appConfig.upload.maxBytes, files: 1 },
  fileFilter: imageFileFilter,
}).single('image');

export function handleMulterError(
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      next(new ValidationError(`Image exceeds ${appConfig.upload.maxBytes} bytes`));
      return;
    }
    next(new ValidationError(err.message));
    return;
  }
  next(err);
}

export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on('finish', () => {
    logger.http('HTTP', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - started,
      userId: req.user?.id,
    });
  });
  next();
}
