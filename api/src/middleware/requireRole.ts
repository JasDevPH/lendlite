import type { Role } from '@prisma/client';
import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError';

// Authorisation guard: only lets through users whose role is in `allowed`.
// Must come AFTER requireAuth, e.g. router.use(requireAuth, requireRole('ADMIN'))
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    // Defensive: if someone forgets requireAuth, fail closed rather than open
    if (!req.user) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    }
    // 403, not 401: we know who they are, they just aren't allowed
    if (!allowed.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
    }
    next();
  };
}
