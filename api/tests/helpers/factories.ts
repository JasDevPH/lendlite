import { ApplicationStatus, EmploymentType, Role, type LoanApplication, type User } from '@prisma/client';
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

// A complete application inserted directly in any status — for tests that
// start mid-flow (e.g. "approve an UNDER_REVIEW application")
export function createApplication(
  user: Pick<User, 'id'>,
  overrides: Partial<Pick<LoanApplication, 'status' | 'amountCents' | 'termMonths' | 'createdAt'>> = {},
): Promise<LoanApplication> {
  return prisma.loanApplication.create({
    data: {
      userId: user.id,
      status: overrides.status ?? ApplicationStatus.DRAFT,
      amountCents: overrides.amountCents ?? 1_000_000,
      termMonths: overrides.termMonths ?? 12,
      purpose: 'Test purpose',
      employmentType: EmploymentType.FULL_TIME,
      employerName: 'Acme Pty Ltd',
      annualIncomeCents: 9_000_000,
      monthlyExpensesCents: 200_000,
      ...(overrides.createdAt && { createdAt: overrides.createdAt }),
    },
  });
}

// File contents that pass the magic-byte check
export const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200)]);
export const EXE_BYTES = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]);

// A real signed JWT, without going through /auth/login (avoids rate limits and bcrypt)
export function authHeader(user: Pick<User, 'id' | 'role'>): { Authorization: string } {
  return { Authorization: `Bearer ${signToken(user)}` };
}
