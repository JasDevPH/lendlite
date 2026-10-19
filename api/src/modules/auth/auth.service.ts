import { Prisma, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import type { LoginInput, RegisterInput } from './auth.schema';

// ~200ms per hash: slow for attackers, fine for a single login. Spec minimum is 10.
const BCRYPT_COST = 12;

// The only user fields ever sent to clients — passwordHash is never selected
export const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

// What we put inside the JWT: who (sub = subject) and what they may do (role)
const tokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  role: z.nativeEnum(Role),
});
export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

export interface AuthResult {
  token: string;
  user: PublicUser;
}

// ---------- Passwords ----------

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

// Compared against when the email doesn't exist, so "unknown email" takes
// as long as "wrong password" and response timing can't reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('timing-attack-dummy', BCRYPT_COST);

// ---------- Tokens ----------

export function signToken(user: { id: string; role: Role }): string {
  const payload: TokenPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    // Env value is a string like "1h"; jsonwebtoken's type wants its own string format
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

// Throws 401 for anything wrong: bad signature, expired, malformed, unexpected payload
export function verifyToken(token: string): TokenPayload {
  try {
    // Pin the algorithm so a token can't pick a weaker one (e.g. "none")
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    return tokenPayloadSchema.parse(decoded);
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
}

// ---------- Use cases ----------

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        passwordHash: await hashPassword(input.password),
        // Explicit: public registration can only ever create customers
        role: Role.CUSTOMER,
      },
      select: publicUserSelect,
    });
    return { token: signToken(user), user };
  } catch (err) {
    // Two simultaneous registrations can both pass the check above;
    // the DB unique constraint (P2002) catches the loser
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always run bcrypt, even for unknown emails (see DUMMY_HASH)
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);

  // Same error for "no such email" and "wrong password": don't reveal which
  if (!user || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  // Pick public fields explicitly, so a column added to User later can't leak by default
  const { id, email, fullName, role, createdAt } = user;
  return { token: signToken(user), user: { id, email, fullName, role, createdAt } };
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  // Valid token but the account no longer exists
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User no longer exists');
  }
  return user;
}
