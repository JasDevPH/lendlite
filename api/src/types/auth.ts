import type { Role } from '@prisma/client';

// The authenticated caller, as set on req.user by requireAuth.
// Services take this (not the Express request) so they stay HTTP-free.
export interface AuthUser {
  id: string;
  role: Role;
}
