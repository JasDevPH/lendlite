import { bpsToDecimal, dollarsToCents, formatAUD, isValidCents, roundToCents } from '../../src/utils/money';

describe('money helpers', () => {
  it('shows why floats are avoided for money', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(19.99 * 100).not.toBe(1999);
    expect(dollarsToCents(19.99)).toBe(1999); // rounding fixes the float noise
  });

  it('roundToCents rounds to the nearest whole cent', () => {
    expect(roundToCents(8884.4)).toBe(8884);
    expect(roundToCents(8884.5)).toBe(8885);
  });

  it('roundToCents refuses NaN and Infinity instead of storing garbage', () => {
    expect(() => roundToCents(Number.NaN)).toThrow(RangeError);
    expect(() => roundToCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('bpsToDecimal converts basis points to a fraction', () => {
    expect(bpsToDecimal(1250)).toBe(0.125);
    expect(bpsToDecimal(500)).toBe(0.05);
  });

  it('isValidCents accepts only safe whole numbers', () => {
    expect(isValidCents(150_000)).toBe(true);
    expect(isValidCents(1500.5)).toBe(false);
    expect(isValidCents(Number.NaN)).toBe(false);
    expect(isValidCents(2 ** 53)).toBe(false);
  });

  it('formatAUD formats cents as Australian dollars', () => {
    expect(formatAUD(123_456)).toBe('$1,234.56');
    expect(formatAUD(5_000_000)).toBe('$50,000.00');
  });
});
