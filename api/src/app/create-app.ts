import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import path from 'node:path';
import swaggerUi from 'swagger-ui-express';
import { appConfig } from '../config/index.js';
import { apiRateLimiter, httpLogger } from '../middlewares/index.js';
import {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
} from '../middlewares/error-handler.js';
import { createContainer, type AppContainer } from './container.js';
import { createApiRouter } from './routes.js';
import { swaggerSpec } from '../docs/swagger.js';
import { prisma } from '../database/prisma.js';
import type { IAiClient } from '../shared/services/ai-client.js';

export interface CreateAppOptions {
  aiClient?: IAiClient;
  container?: AppContainer;
}

/**
 * Application factory — used by main.ts and integration tests.
 */
export function createApp(options: CreateAppOptions = {}): Application {
  const app = express();
  const container = options.container ?? createContainer(prisma, options.aiClient);

  app.set('trust proxy', 1);

  app.use(requestIdMiddleware);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: appConfig.corsOrigin === '*' ? true : appConfig.corsOrigin.split(','),
      credentials: true,
    }),
  );
  app.use((req, res, next) => {
    if (req.body !== undefined && typeof req.body === 'object') {
      return next();
    }
    express.json({ limit: '1mb' })(req, res, next);
  });
  app.use((req, res, next) => {
    if (req.body !== undefined && typeof req.body === 'object') {
      return next();
    }
    express.urlencoded({ extended: true })(req, res, next);
  });
  app.use(apiRateLimiter);

  if (!appConfig.isTest) {
    app.use(morgan(appConfig.isProduction ? 'combined' : 'dev'));
    app.use(httpLogger);
  }

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
  app.get('/docs.json', (_req, res) => {
    res.json(swaggerSpec);
  });

  // Only relevant when Supabase Storage is not configured — see
  // shared/services/local-storage.service.ts. Serves the same `uploads/`
  // directory the legacy disk-based /scan upload also writes to.
  if (!appConfig.supabase.isConfigured) {
    app.use('/uploads', express.static(path.resolve(process.cwd(), appConfig.upload.dir)));
  }

  app.use(createApiRouter(container));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
