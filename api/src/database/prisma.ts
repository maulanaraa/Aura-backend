import { PrismaClient } from '@prisma/client';
import { appConfig } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';

/**
 * Singleton Prisma client.
 * One connection pool per process — never instantiate in repositories.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: appConfig.isProduction
      ? ['error']
      : [
          { emit: 'event', level: 'query' },
          { emit: 'stdout', level: 'error' },
          { emit: 'stdout', level: 'warn' },
        ],
  });

if (!appConfig.isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('PostgreSQL connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('PostgreSQL disconnected');
}
