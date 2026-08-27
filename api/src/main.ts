import { createApp } from './app/create-app.js';
import { appConfig } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './database/prisma.js';
import { logger } from './shared/utils/logger.js';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(appConfig.port, () => {
    logger.info(`AuraAI API listening on :${appConfig.port}`, {
      env: appConfig.env,
      docs: `http://localhost:${appConfig.port}/docs`,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  logger.error('Failed to start AuraAI API', {
    error: error instanceof Error ? error.message : error,
  });
  process.exit(1);
});
