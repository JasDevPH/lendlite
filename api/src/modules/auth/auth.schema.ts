import { z } from 'zod';

// Normalise emails so "Jo@Example.com " and "jo@example.com" are the same account
const email = z.string().trim().toLowerCase().email('Invalid email address').max(254);

// Spec: min 8 chars, at least 1 letter and 1 number.
// Max 72: bcrypt silently ignores everything after 72 bytes, so longer
// passwords would give a false sense of security.
const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const registerSchema = z.object({
  email,
  password: newPassword,
  fullName: z.string().trim().min(2, 'Full name is required').max(100),
});

// Login only checks presence: strength rules apply when a password is created,
// and revealing them on login would hint at what a valid password looks like
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(72),
});

// Types inferred from the schemas: one source of truth for validation AND types
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
