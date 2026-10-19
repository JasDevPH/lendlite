import { ApplicationStatus } from '@prisma/client';
import { z } from 'zod';

// Query strings are always strings ("?page=2"), so numbers use z.coerce here —
// unlike JSON bodies, where we insist on real numbers.
const centsParam = z.coerce.number().int('Must be whole cents').min(0);

export const listApplicationsQuerySchema = z
  .object({
    status: z.nativeEnum(ApplicationStatus).optional(),
    minAmount: centsParam.optional(), // in cents, like every money value in the API
    maxAmount: centsParam.optional(),
    page: z.coerce.number().int().min(1).default(1),
    // Capped so nobody can ask for 1,000,000 rows in one request
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((q) => q.minAmount === undefined || q.maxAmount === undefined || q.minAmount <= q.maxAmount, {
    message: 'minAmount cannot be greater than maxAmount',
    path: ['minAmount'],
  });

export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
