/**
 * Prisma client singleton for the NeuroWealth agent.
 * Issue #25: User position tracking database schema and ORM models.
 *
 * Usage:
 *   import { prisma } from './prismaClient';
 *   const user = await prisma.user.findUnique({ where: { stellarAddress } });
 */

import { PrismaClient } from '@prisma/client';
import logger from './logger';

// Prevent multiple client instances during hot-reload in development.
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

// Forward Prisma log events to the structured Pino logger.
prisma.$on('query' as never, (e: { query: string; duration: number }) => {
  logger.debug({ query: e.query, durationMs: e.duration }, 'prisma:query');
});

prisma.$on('error' as never, (e: { message: string; target: string }) => {
  logger.error({ target: e.target, message: e.message }, 'prisma:error');
});

prisma.$on('warn' as never, (e: { message: string }) => {
  logger.warn({ message: e.message }, 'prisma:warn');
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
