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
