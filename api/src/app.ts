import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { adminRouter } from './modules/admin/admin.routes';
import { applicationsRouter } from './modules/applications/applications.routes';
import { authRouter } from './modules/auth/auth.routes';
import { calculatorRouter } from './modules/calculator/calculator.routes';
import { documentsRouter } from './modules/documents/documents.routes';
import { AppError } from './utils/AppError';

// Builds the Express app WITHOUT calling listen(), so tests (Supertest)
// can import it and fire requests without opening a real port.
export const app = express();

// Behind a proxy (Railway), req.ip must come from X-Forwarded-For, or every
// user shares the proxy's IP and one login limit (see TRUST_PROXY in env.ts)
app.set('trust proxy', env.TRUST_PROXY);

// Security headers (no X-Powered-By, nosniff, frame protection, etc.)
app.use(helmet());
// Only our web frontend may call the API from a browser
// (exposedHeaders: browsers hide non-standard response headers from JS unless listed)
app.use(cors({ origin: env.WEB_ORIGIN, exposedHeaders: ['Idempotent-Replayed', 'Retry-After'] }));
// Small body limit: our JSON payloads are tiny; big bodies are likely abuse (→ 413)
app.use(express.json({ limit: '100kb' }));
// One log line per request: method, URL, status, response time
app.use(
  pinoHttp({
    logger,
    // Log only what's useful; full headers are noisy and may contain cookies/tokens
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }),
);

// All endpoints live under /api/v1 so a future v2 can run side by side
const api = express.Router();

// Health check for Docker/CI/uptime monitors: is the API up AND can it reach the DB?
api.get('/health', async (_req, res, next) => {
  try {
    // Cheapest possible round-trip to the database
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.error({ err }, 'Health check: database unreachable');
    // 503 = "temporarily unable to serve", so load balancers stop routing here
    return next(new AppError(503, 'SERVICE_UNAVAILABLE', 'Database is unreachable'));
  }

  res.json({
    data: {
      status: 'ok',
      database: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

api.use('/auth', authRouter);
api.use('/calculator', calculatorRouter);
api.use('/applications', applicationsRouter);
api.use('/documents', documentsRouter);
api.use('/admin', adminRouter);

app.use('/api/v1', api);

// Order matters: unknown routes → 404, then every error → formatted JSON
app.use(notFoundHandler);
app.use(errorHandler);
