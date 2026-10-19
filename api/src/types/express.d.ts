import type { Role } from '@prisma/client';

// Adds `req.user` to Express's Request type. The auth middleware sets it
// after verifying the JWT; it's undefined on public routes.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export {};
