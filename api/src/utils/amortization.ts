import { bpsToDecimal, roundToCents, type BasisPoints, type Cents } from './money';

// PURE functions: same input → same output, no DB, no clock (the start date is
// passed in). That makes them trivial to unit test and safe to reuse anywhere.

export interface ScheduleInput {
  principalCents: Cents;
  annualRateBps: BasisPoints;
  termMonths: number;
  // Decision date; the first installment is due one month after it
  startDate: Date;
}

export interface Installment {
  installmentNo: number; // 1-based
  dueDate: Date;
  paymentCents: Cents;
  principalCents: Cents;
  interestCents: Cents;
  balanceCents: Cents; // remaining balance AFTER this payment
}

export interface Schedule {
  monthlyPaymentCents: Cents; // the regular payment (the last one may differ by a few cents)
  totalInterestCents: Cents;
  totalPaymentCents: Cents;
  installments: Installment[];
}

function assertInputs(principalCents: number, annualRateBps: number, termMonths: number): void {
  if (!Number.isSafeInteger(principalCents) || principalCents <= 0) {
    throw new RangeError('principalCents must be a positive integer');
  }
  if (!Number.isSafeInteger(annualRateBps) || annualRateBps < 0) {
    throw new RangeError('annualRateBps must be a non-negative integer');
  }
  if (!Number.isSafeInteger(termMonths) || termMonths <= 0) {
    throw new RangeError('termMonths must be a positive integer');
  }
}

// Standard amortization formula:  M = P · r(1+r)^n / ((1+r)^n − 1)
// where r = monthly rate, n = number of months. Result rounded to whole cents.
export function calculateMonthlyPayment(
  principalCents: Cents,
  annualRateBps: BasisPoints,
  termMonths: number,
): Cents {
  assertInputs(principalCents, annualRateBps, termMonths);

  const r = bpsToDecimal(annualRateBps) / 12;
  // 0% loan: the formula divides by zero, so just split the principal evenly
  if (r === 0) {
    return roundToCents(principalCents / termMonths);
  }

  const growth = (1 + r) ** termMonths;
  return roundToCents((principalCents * r * growth) / (growth - 1));
}

// Adds months in UTC, clamping to the month's last day (Jan 31 + 1 → Feb 28/29).
// Always counted from the ORIGINAL date, so a short month doesn't shift every
// later due date (Jan 31 → Feb 28 → Mar 31, not Mar 28).
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  // Day 0 of the following month = last day of the target month
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTarget);

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export function generateSchedule(input: ScheduleInput): Schedule {
  const { principalCents, annualRateBps, termMonths, startDate } = input;
  const monthlyPaymentCents = calculateMonthlyPayment(principalCents, annualRateBps, termMonths);
  const r = bpsToDecimal(annualRateBps) / 12;

  const installments: Installment[] = [];
  let balance = principalCents;

  for (let no = 1; no <= termMonths; no++) {
    // Interest is charged on what's still owed, rounded to the cent each month
    const interestCents = roundToCents(balance * r);
    const isLast = no === termMonths;

    // The LAST installment pays off exactly what's left, absorbing all the
    // rounding differences, so the final balance is exactly 0
    const principalPart = isLast ? balance : monthlyPaymentCents - interestCents;
    balance -= principalPart;

    installments.push({
      installmentNo: no,
      dueDate: addMonths(startDate, no),
      paymentCents: principalPart + interestCents,
      principalCents: principalPart,
      interestCents,
      balanceCents: balance,
    });
  }

  const totalInterestCents = installments.reduce((sum, i) => sum + i.interestCents, 0);

  return {
    monthlyPaymentCents,
    totalInterestCents,
    totalPaymentCents: principalCents + totalInterestCents,
    installments,
  };
}
