import { z } from 'zod';

// Client-side copies of the API's rules (api/src/modules/auth/auth.schema.ts).
// They give instant feedback; the SERVER still validates everything, because
// anything running in the browser can be bypassed.

const email = z.string().trim().min(1, 'Email is required').email('Enter a valid email address');

export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'At least one letter', test: (p: string) => /[A-Za-z]/.test(p) },
  { label: 'At least one number', test: (p: string) => /[0-9]/.test(p) },
] as const;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(100),
  email,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

// ZodError → { field: firstMessage }, the same shape as ApiError.fieldErrors()
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
