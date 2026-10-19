import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Builds the Express app WITHOUT calling listen(), so tests (Supertest)
// can import it and fire requests without opening a real port.
export const app = express();

// Security headers (no X-Powered-By, nosniff, frame protection, etc.)
app.use(helmet());
// Only our web frontend may call the API from a browser
app.use(cors({ origin: env.WEB_ORIGIN }));
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

// Liveness check for Docker/CI/uptime monitors. DB check is added in Phase 2.
api.get('/health', (_req, res) => {
  res.json({
    data: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

app.use('/api/v1', api);

// Order matters: unknown routes → 404, then every error → formatted JSON
app.use(notFoundHandler);
app.use(errorHandler);
