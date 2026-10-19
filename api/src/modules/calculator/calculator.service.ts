import { generateSchedule } from '../../utils/amortization';
import type { Cents } from '../../utils/money';
import type { QuoteInput } from './calculator.schema';

export interface Quote extends QuoteInput {
  monthlyPaymentCents: Cents;
  totalInterestCents: Cents;
  totalPaymentCents: Cents;
}

// Uses the SAME schedule generator as real approvals, so the quote a customer
// sees always matches what they'd actually be charged at that rate
export function getQuote(input: QuoteInput): Quote {
  const schedule = generateSchedule({
    principalCents: input.amountCents,
    annualRateBps: input.annualRateBps,
    termMonths: input.termMonths,
    // Totals don't depend on dates; any start date works for a quote
    startDate: new Date(),
  });

  return {
    ...input,
    monthlyPaymentCents: schedule.monthlyPaymentCents,
    totalInterestCents: schedule.totalInterestCents,
    totalPaymentCents: schedule.totalPaymentCents,
  };
}
