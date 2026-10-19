import { z } from 'zod';
import { amountCentsField, annualRateBpsField, termMonthsField } from '../../config/loanRules';

export const quoteSchema = z.object({
  amountCents: amountCentsField,
  termMonths: termMonthsField,
  annualRateBps: annualRateBpsField,
});

export type QuoteInput = z.infer<typeof quoteSchema>;
