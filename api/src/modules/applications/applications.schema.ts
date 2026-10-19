import { EmploymentType } from '@prisma/client';
import { z } from 'zod';
import { amountCentsField, termMonthsField } from '../../config/loanRules';

// Sanity cap for income/expenses: $10M. Stops absurd values / int overflow typos.
const MAX_PERSONAL_CENTS = 1_000_000_000;

const purposeField = z
  .string()
  .trim()
  .min(3, 'Purpose must be at least 3 characters')
  .max(200, 'Purpose must be at most 200 characters');

const nonNegativeCents = z
  .number()
  .int('Must be whole cents')
  .min(0, 'Cannot be negative')
  .max(MAX_PERSONAL_CENTS, 'Value is unrealistically large');

// Step 2 of the form ("Employment & income"). All optional while it's a draft;
// the submit step checks that everything required is filled in.
const employmentFields = {
  employmentType: z.nativeEnum(EmploymentType).optional(),
  employerName: z.string().trim().min(1).max(200).optional(),
  annualIncomeCents: nonNegativeCents.optional(),
  monthlyExpensesCents: nonNegativeCents.optional(),
};

// POST /applications — creates a DRAFT. Loan details (step 1) are required.
// Fields like status, userId, annualRateBps are NOT listed, so clients can't set them.
export const createApplicationSchema = z.object({
  amountCents: amountCentsField,
  termMonths: termMonthsField,
  purpose: purposeField,
  ...employmentFields,
});

// PATCH /applications/:id — partial update of a DRAFT; any subset of fields
export const updateApplicationSchema = z
  .object({
    amountCents: amountCentsField.optional(),
    termMonths: termMonthsField.optional(),
    purpose: purposeField.optional(),
    ...employmentFields,
  })
  // An empty PATCH is almost certainly a client bug; reject it clearly
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

// :id in the URL must be a UUID — malformed IDs get a clean 400, never reach the DB
export const applicationIdParamsSchema = z.object({
  id: z.string().uuid('Invalid application id'),
});

// Optional `Idempotency-Key` header on submit. Clients should send a fresh
// random value (e.g. a UUID) per submit *intent*, and reuse it on retries.
// Wrapped in an object so validation errors name the header in `path`
export const submitHeadersSchema = z.object({
  'idempotency-key': z
    .string()
    .trim()
    .min(8, 'Idempotency-Key must be at least 8 characters')
    .max(255, 'Idempotency-Key must be at most 255 characters')
    .optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
