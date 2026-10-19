import rateLimit, { MemoryStore, type Options } from 'express-rate-limit';
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

// Explicit stores (one per limiter — they can't be shared), so counts can be
// cleared. In production this would be a Redis store shared by all instances.
const loginStore = new MemoryStore();
const authStore = new MemoryStore();

// Spec: login limited to 5 attempts per minute per IP — slows password guessing
export const loginLimiter = rateLimit({
  ...baseOptions,
  store: loginStore,
  limit: 5,
  message: 'Too many login attempts. Please try again in a minute.',
});

// Looser cap on every /auth route (register, me…) to stop scripted abuse
// such as mass account creation
export const authLimiter = rateLimit({
  ...baseOptions,
  store: authStore,
  limit: 30,
  message: 'Too many requests. Please slow down.',
});

// Clears all counters. Used by tests so each test starts with a fresh quota
// (otherwise logins from earlier tests would trigger 429s in later ones).
export async function resetRateLimits(): Promise<void> {
  await Promise.all([loginStore.resetAll(), authStore.resetAll()]);
}
