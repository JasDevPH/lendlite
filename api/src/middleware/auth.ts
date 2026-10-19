import type { RequestHandler } from 'express';
import { verifyToken } from '../modules/auth/auth.service';
import { AppError } from '../utils/AppError';

// Expects: Authorization: Bearer <jwt>   (scheme is case-insensitive per the HTTP spec)
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

// Protects a route: verifies the JWT and puts { id, role } on req.user.
// Any problem → 401, so the client knows to (re)login.
export const requireAuth: RequestHandler = (req, _res, next) => {
  const match = req.headers.authorization?.match(BEARER_PATTERN);
  if (!match?.[1]) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header'));
  }

  try {
    const payload = verifyToken(match[1]);
    // Role comes from the token: no DB lookup per request (stateless), but it
    // can be up to 1h stale if an admin changes someone's role
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    next(err);
  }
};
