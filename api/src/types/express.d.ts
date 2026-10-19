import type { AuthUser } from './auth';

// Adds `req.user` to Express's Request type. The auth middleware sets it
// after verifying the JWT; it's undefined on public routes.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
