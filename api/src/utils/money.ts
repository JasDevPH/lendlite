// Money helpers. Rule: money is ALWAYS an integer number of cents and rates
// are integer basis points (1 bp = 0.01%, so 12.50% = 1250 bps).
// Floats only appear briefly inside calculations and are rounded straight back to cents.

// Readability aliases: still plain numbers at runtime
export type Cents = number;
export type BasisPoints = number;

const BPS_PER_UNIT = 10_000; // 10000 bps = 100% = 1.0

// True for whole, finite numbers within JS's exact-integer range (±9 quadrillion)
export function isValidCents(value: number): boolean {
  return Number.isSafeInteger(value);
}

// Round a calculated (fractional) cent amount to the nearest whole cent.
// Math.round rounds .5 up — fine because loan amounts are always positive.
export function roundToCents(amount: number): Cents {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Cannot round non-finite amount: ${amount}`);
  }
  return Math.round(amount);
}

// 1250 bps → 0.125 (12.5% as a decimal), for use in formulas
export function bpsToDecimal(bps: BasisPoints): number {
  return bps / BPS_PER_UNIT;
}

// For tests and seed data: $10,000.00 → 1_000_000 cents.
// Rounding absorbs float noise, e.g. 19.99 * 100 = 1998.9999999999998
export function dollarsToCents(dollars: number): Cents {
  return roundToCents(dollars * 100);
}

const audFormatter = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

// 123456 → "$1,234.56" — for logs/messages only; the API always returns raw cents
export function formatAUD(cents: Cents): string {
  return audFormatter.format(cents / 100);
}
