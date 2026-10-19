// Front-end copy of the API's limits (api/src/config/loanRules.ts), used for
// slider ranges and form validation. The API remains the authority.
export const LOAN_LIMITS = {
  minAmountCents: 200_000, // $2,000
  maxAmountCents: 5_000_000, // $50,000
  minTermMonths: 6,
  maxTermMonths: 60,
  minRateBps: 500, // 5%
  maxRateBps: 2_500, // 25%
} as const;
