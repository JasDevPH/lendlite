import { z } from 'zod';
import { formatCentsWhole, parseDollarsToCents } from '../format';
import { LOAN_LIMITS as L } from '../loanRules';

// Common reasons, so most people just pick one; "Other" reveals a text box.
// The API stores purpose as free text (3–200 chars).
export const PURPOSE_OPTIONS = [
  'Car purchase',
  'Debt consolidation',
  'Home improvement',
  'Wedding',
  'Travel',
  'Medical expenses',
  'Education',
  'Other',
] as const;

// Raw form values (everything is a string while the user is typing)
export interface LoanDetailsValues {
  amount: string; // dollars, e.g. "15,000"
  termMonths: string;
  purposeChoice: string;
  purposeOther: string;
}

// Form strings → the API's shape ({ amountCents, termMonths, purpose }).
// Mirrors the API's rules for instant feedback; the API re-validates.
export const loanDetailsSchema = z
  .object({
    amount: z
      .string()
      .trim()
      .min(1, "Enter how much you'd like to borrow")
      // Dollars → cents with string maths (no float errors), then range-check
      .transform((value, ctx) => {
        const cents = parseDollarsToCents(value);
        if (cents === null) {
          ctx.addIssue({ code: 'custom', message: 'Enter an amount in dollars, e.g. 15000' });
          return z.NEVER;
        }
        return cents;
      })
      .pipe(
        z
          .number()
          .min(L.minAmountCents, `The minimum is ${formatCentsWhole(L.minAmountCents)}`)
          .max(L.maxAmountCents, `The maximum is ${formatCentsWhole(L.maxAmountCents)}`),
      ),
    termMonths: z.coerce
      .number({ invalid_type_error: 'Choose a loan term' })
      .int()
      .min(L.minTermMonths, 'Choose a loan term')
      .max(L.maxTermMonths, 'Choose a loan term'),
    purposeChoice: z.string().min(1, 'Choose what the loan is for'),
    purposeOther: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.purposeChoice === 'Other' && values.purposeOther.length < 3) {
      ctx.addIssue({ path: ['purposeOther'], code: 'custom', message: 'Tell us what the loan is for (at least 3 characters)' });
    }
    if (values.purposeOther.length > 200) {
      ctx.addIssue({ path: ['purposeOther'], code: 'custom', message: 'Keep it under 200 characters' });
    }
  })
  .transform((values) => ({
    amountCents: values.amount,
    termMonths: values.termMonths,
    purpose: values.purposeChoice === 'Other' ? values.purposeOther : values.purposeChoice,
  }));

export type LoanDetailsPayload = z.output<typeof loanDetailsSchema>;

// API field names → form field names (for showing server-side errors in place)
export const LOAN_DETAILS_API_FIELDS: Record<string, keyof LoanDetailsValues> = {
  amountCents: 'amount',
  termMonths: 'termMonths',
  purpose: 'purposeChoice',
};

// 6, 12, … 60 — plus any other value already chosen (e.g. 17 from the calculator)
export function termOptions(current?: number): { value: string; label: string }[] {
  const terms = new Set<number>();
  for (let m = L.minTermMonths; m <= L.maxTermMonths; m += 6) terms.add(m);
  if (current && current >= L.minTermMonths && current <= L.maxTermMonths) terms.add(current);
  return [...terms].sort((a, b) => a - b).map((m) => ({ value: String(m), label: `${m} months` }));
}
