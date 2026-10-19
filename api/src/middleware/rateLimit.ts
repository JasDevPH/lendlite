import rateLimit, { type Options } from 'express-rate-limit';
import { AppError } from '../utils/AppError';

const ONE_MINUTE = 60 * 1000;

// Shared settings. Counts are kept in memory per process: fine for one
// instance; with several instances you'd use a shared store (e.g. Redis).
const baseOptions: Partial<Options> = {
  windowMs: ONE_MINUTE,
  // Modern `RateLimit` headers tell clients their remaining quota
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Route the 429 through our errorHandler so it has the usual { error } shape
  handler: (_req, _res, next, options) => {
    next(new AppError(429, 'RATE_LIMITED', options.message as string));
  },
};

// Spec: login limited to 5 attempts per minute per IP — slows password guessing
export const loginLimiter = rateLimit({
  ...baseOptions,
  limit: 5,
  message: 'Too many login attempts. Please try again in a minute.',
});

// Looser cap on every /auth route (register, me…) to stop scripted abuse
// such as mass account creation
export const authLimiter = rateLimit({
  ...baseOptions,
  limit: 30,
  message: 'Too many requests. Please slow down.',
});
