import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { sendSuccess } from '../../shared/utils/api-response.js';
import type { IAiClient } from '../../shared/services/ai-client.js';
import axios from 'axios';
import { appConfig } from '../../config/index.js';

export interface HealthModuleDeps {
  aiClient?: IAiClient;
}

export function createHealthModule(_deps: HealthModuleDeps = {}): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      let database: 'up' | 'down' = 'down';
      let aiService: 'up' | 'down' | 'unknown' = 'unknown';

      try {
        await prisma.$queryRaw`SELECT 1`;
        database = 'up';
      } catch {
        database = 'down';
      }

      try {
        await axios.get(`${appConfig.ai.baseUrl}/health`, { timeout: 2000 });
        aiService = 'up';
      } catch {
        aiService = 'down';
      }

      const status = database === 'up' ? 'ok' : 'degraded';
      sendSuccess(res, {
        status,
        service: 'auraai-backend',
        timestamp: new Date().toISOString(),
        checks: { database, aiService },
      });
    }),
  );

  return router;
}
