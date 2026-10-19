import { z } from 'zod';

// Business limits from the spec, in ONE place. Used by the calculator,
// application validation and admin approval, so they can never disagree.
export const LOAN_LIMITS = {
  minAmountCents: 200_000, // $2,000.00
  maxAmountCents: 5_000_000, // $50,000.00
  minTermMonths: 6,
  maxTermMonths: 60,
  minRateBps: 500, // 5.00% p.a.
  maxRateBps: 2_500, // 25.00% p.a.
} as const;

const L = LOAN_LIMITS;

// Reusable Zod field validators built from the limits above.
// Strict numbers (no coercion): "100000" as a string is a client bug, not input to guess at.
export const amountCentsField = z
  .number()
  .int('amountCents must be whole cents')
  .min(L.minAmountCents, 'Minimum loan amount is $2,000')
  .max(L.maxAmountCents, 'Maximum loan amount is $50,000');

export const termMonthsField = z
  .number()
  .int('termMonths must be a whole number')
  .min(L.minTermMonths, `Term must be at least ${L.minTermMonths} months`)
  .max(L.maxTermMonths, `Term must be at most ${L.maxTermMonths} months`);

export const annualRateBpsField = z
  .number()
  .int('annualRateBps must be a whole number')
  .min(L.minRateBps, 'Rate must be at least 5% (500 bps)')
  .max(L.maxRateBps, 'Rate must be at most 25% (2500 bps)');
