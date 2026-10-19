import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { AppError } from '../utils/AppError';

// Errors thrown by express.json() (body-parser) carry a `type` and an HTTP `status`
interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

// Registered after all routes: anything that reaches here matched no route
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
};

// Express recognises error middleware by its 4 parameters, so `_next` must stay
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // 1. Errors we threw on purpose
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
    return;
  }

  // 2. Zod validation failures → 400 with a per-field list
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  // 3. Upload problems from multer: too big → 413 (spec), anything else → 400
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'File exceeds the maximum upload size' } });
      return;
    }
    // e.g. LIMIT_UNEXPECTED_FILE (wrong field name / 2 files), LIMIT_FIELD_COUNT
    res.status(400).json({ error: { code: 'INVALID_UPLOAD', message: err.message } });
    return;
  }

  // 4. Malformed JSON or oversized body from express.json()
  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
      return;
    }
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
      return;
    }
  }

  // 5. Anything else is a bug: log full details server-side, but never leak
  //    stack traces or internals to the client
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};
