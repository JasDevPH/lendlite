import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { logger } from './logger';

// ONE shared client for the whole app. Each PrismaClient owns a connection
// pool, so creating one per request would quickly exhaust DB connections.
export const prisma = new PrismaClient({
  // Send Prisma's warnings/errors through pino instead of console
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
    // Every SQL query, but only in development (very noisy)
    ...(env.NODE_ENV === 'development' ? [{ emit: 'event' as const, level: 'query' as const }] : []),
  ],
});

prisma.$on('warn', (e) => logger.warn({ target: e.target }, e.message));
prisma.$on('error', (e) => logger.error({ target: e.target }, e.message));
prisma.$on('query', (e) => logger.debug({ durationMs: e.duration }, e.query));
