import { z } from 'zod';
import { LOAN_LIMITS as L } from '../../config/loanRules';

// Strict numbers (no coercion): "100000" as a string is a client bug, not input to guess at
export const quoteSchema = z.object({
  amountCents: z
    .number()
    .int('amountCents must be whole cents')
    .min(L.minAmountCents, 'Minimum loan amount is $2,000')
    .max(L.maxAmountCents, 'Maximum loan amount is $50,000'),
  termMonths: z
    .number()
    .int()
    .min(L.minTermMonths, `Term must be at least ${L.minTermMonths} months`)
    .max(L.maxTermMonths, `Term must be at most ${L.maxTermMonths} months`),
  annualRateBps: z
    .number()
    .int()
    .min(L.minRateBps, 'Rate must be at least 5% (500 bps)')
    .max(L.maxRateBps, 'Rate must be at most 25% (2500 bps)'),
});

export type QuoteInput = z.infer<typeof quoteSchema>;
