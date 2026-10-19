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

// ---------- Step 2: employment & income ----------

export const EMPLOYMENT_OPTIONS = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'SELF_EMPLOYED', label: 'Self-employed' },
  { value: 'UNEMPLOYED', label: 'Not currently working' },
] as const;

export interface EmploymentValues {
  employmentType: string;
  employerName: string;
  annualIncome: string; // dollars, before tax
  monthlyExpenses: string; // dollars
}

// Same sanity cap as the API ($10M)
const MAX_PERSONAL_CENTS = 1_000_000_000;

// "$85,000" → cents; 0 is allowed (no income / no expenses is a real answer)
function dollarsField(requiredMessage: string) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .transform((value, ctx) => {
      const cents = parseDollarsToCents(value);
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: 'Enter an amount in dollars, e.g. 85000' });
        return z.NEVER;
      }
      return cents;
    })
    .pipe(z.number().max(MAX_PERSONAL_CENTS, 'That amount looks too large — please check it'));
}

export const employmentSchema = z
  .object({
    employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CASUAL', 'SELF_EMPLOYED', 'UNEMPLOYED'], {
      errorMap: () => ({ message: 'Choose your employment status' }),
    }),
    employerName: z.string().trim().max(200, 'Keep it under 200 characters'),
    annualIncome: dollarsField('Enter your annual income (enter 0 if none)'),
    monthlyExpenses: dollarsField('Enter your monthly expenses (enter 0 if none)'),
  })
  // An employer/business name only matters if you have one (matches the API's submit rule)
  .superRefine((values, ctx) => {
    if (values.employmentType !== 'UNEMPLOYED' && values.employerName.length === 0) {
      ctx.addIssue({
        path: ['employerName'],
        code: 'custom',
        message: values.employmentType === 'SELF_EMPLOYED' ? 'Enter your business name' : 'Enter your employer’s name',
      });
    }
  })
  .transform((values) => ({
    employmentType: values.employmentType,
    // Not sent when unemployed (there's nothing to record)
    ...(values.employmentType !== 'UNEMPLOYED' && { employerName: values.employerName }),
    annualIncomeCents: values.annualIncome,
    monthlyExpensesCents: values.monthlyExpenses,
  }));

export const EMPLOYMENT_API_FIELDS: Record<string, keyof EmploymentValues> = {
  employmentType: 'employmentType',
  employerName: 'employerName',
  annualIncomeCents: 'annualIncome',
  monthlyExpensesCents: 'monthlyExpenses',
};

// Cents → the text shown in a dollar input ("85000", or "85000.50")
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

// 6, 12, … 60 — plus any other value already chosen (e.g. 17 from the calculator)
export function termOptions(current?: number): { value: string; label: string }[] {
  const terms = new Set<number>();
  for (let m = L.minTermMonths; m <= L.maxTermMonths; m += 6) terms.add(m);
  if (current && current >= L.minTermMonths && current <= L.maxTermMonths) terms.add(current);
  return [...terms].sort((a, b) => a - b).map((m) => ({ value: String(m), label: `${m} months` }));
}
