import { Role, type User } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { hashPassword, signToken } from '../../src/modules/auth/auth.service';

export const DEFAULT_PASSWORD = 'Password123';

let counter = 0;

// Creates a user directly in the DB (fast, no HTTP). Unique email each call.
export async function createUser(overrides: { role?: Role; email?: string; password?: string; fullName?: string } = {}): Promise<User> {
  counter += 1;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user${counter}@test.dev`,
      fullName: overrides.fullName ?? `Test User ${counter}`,
      role: overrides.role ?? Role.CUSTOMER,
      passwordHash: await hashPassword(overrides.password ?? DEFAULT_PASSWORD),
    },
  });
}

export function createAdmin(): Promise<User> {
  return createUser({ role: Role.ADMIN, fullName: 'Test Admin' });
}

// A real signed JWT, without going through /auth/login (avoids rate limits and bcrypt)
export function authHeader(user: Pick<User, 'id' | 'role'>): { Authorization: string } {
  return { Authorization: `Bearer ${signToken(user)}` };
}
