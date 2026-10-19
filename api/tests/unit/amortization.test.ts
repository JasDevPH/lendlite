import { addMonths, calculateMonthlyPayment, generateSchedule, type Schedule } from '../../src/utils/amortization';

const START = new Date('2026-10-19T00:00:00Z');

// Deterministic pseudo-random numbers (same sequence every run), so a failure
// in the property test below is always reproducible
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

function sum(schedule: Schedule, field: 'paymentCents' | 'principalCents' | 'interestCents'): number {
  return schedule.installments.reduce((total, i) => total + i[field], 0);
}

describe('calculateMonthlyPayment', () => {
  it('matches the spec example: $10,000 at 12% for 12 months ≈ $888.49', () => {
    expect(calculateMonthlyPayment(1_000_000, 1200, 12)).toBe(88_849);
  });

  it('matches a known value for a long, high-rate loan ($50,000 at 25% over 60 months)', () => {
    expect(calculateMonthlyPayment(5_000_000, 2500, 60)).toBe(146_757);
  });

  it('splits the principal evenly at 0% interest (formula would divide by zero)', () => {
    expect(calculateMonthlyPayment(120_000, 0, 12)).toBe(10_000);
  });

  it.each([
    ['zero principal', 0, 1200, 12],
    ['fractional principal', 1000.5, 1200, 12],
    ['negative rate', 100_000, -1, 12],
    ['zero term', 100_000, 1200, 0],
    ['fractional term', 100_000, 1200, 1.5],
  ])('rejects %s', (_label, principal, rate, term) => {
    expect(() => calculateMonthlyPayment(principal, rate, term)).toThrow(RangeError);
  });
});

describe('generateSchedule — spec example ($10,000, 12%, 12 months)', () => {
  const schedule = generateSchedule({ principalCents: 1_000_000, annualRateBps: 1200, termMonths: 12, startDate: START });
  const first = schedule.installments[0]!;
  const last = schedule.installments[11]!;

  it('has one installment per month, numbered 1..12', () => {
    expect(schedule.installments.map((i) => i.installmentNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('charges the first month interest on the full balance (1% of $10,000 = $100)', () => {
    expect(first).toMatchObject({ paymentCents: 88_849, interestCents: 10_000, principalCents: 78_849, balanceCents: 921_151 });
  });

  it('ends with a balance of exactly 0', () => {
    expect(last.balanceCents).toBe(0);
  });

  it('lets the last installment absorb the rounding remainder', () => {
    expect(last.paymentCents).toBe(88_847); // 2 cents less than the regular payment
  });

  it('repays exactly the principal, and totals add up', () => {
    expect(sum(schedule, 'principalCents')).toBe(1_000_000);
    expect(schedule.totalInterestCents).toBe(66_186);
    expect(sum(schedule, 'interestCents')).toBe(schedule.totalInterestCents);
    expect(sum(schedule, 'paymentCents')).toBe(schedule.totalPaymentCents);
    expect(schedule.totalPaymentCents).toBe(1_066_186);
  });

  it('makes the first payment due one month after the start date', () => {
    expect(first.dueDate.toISOString()).toBe('2026-11-19T00:00:00.000Z');
    expect(last.dueDate.toISOString()).toBe('2027-10-19T00:00:00.000Z');
  });
});

describe('generateSchedule — 0% loan', () => {
  it('pays off evenly with the remainder in the last installment', () => {
    const schedule = generateSchedule({ principalCents: 100_000, annualRateBps: 0, termMonths: 3, startDate: START });

    expect(schedule.installments.map((i) => i.paymentCents)).toEqual([33_333, 33_333, 33_334]);
    expect(schedule.totalInterestCents).toBe(0);
    expect(schedule.installments.at(-1)!.balanceCents).toBe(0);
  });
});

describe('generateSchedule — invariants hold for any valid loan (property test)', () => {
  it('holds for 1,000 random loans within the spec limits', () => {
    const random = seededRandom(42);

    for (let n = 0; n < 1000; n++) {
      const principalCents = 200_000 + Math.floor(random() * 4_800_001); // $2,000–$50,000
      const annualRateBps = 500 + Math.floor(random() * 2001); // 5%–25%
      const termMonths = 6 + Math.floor(random() * 55); // 6–60
      const schedule = generateSchedule({ principalCents, annualRateBps, termMonths, startDate: START });
      const context = { principalCents, annualRateBps, termMonths };

      expect({ ...context, length: schedule.installments.length }).toEqual({ ...context, length: termMonths });
      expect({ ...context, finalBalance: schedule.installments.at(-1)!.balanceCents }).toEqual({ ...context, finalBalance: 0 });
      expect({ ...context, repaid: sum(schedule, 'principalCents') }).toEqual({ ...context, repaid: principalCents });

      for (const i of schedule.installments) {
        // Every amount is whole cents, never negative, and payment = principal + interest
        expect(Number.isSafeInteger(i.paymentCents) && Number.isSafeInteger(i.interestCents)).toBe(true);
        expect(i.balanceCents).toBeGreaterThanOrEqual(0);
        expect(i.paymentCents).toBe(i.principalCents + i.interestCents);
      }
    }
  });
});

describe('addMonths', () => {
  const jan31 = new Date('2028-01-31T00:00:00Z'); // 2028 is a leap year

  it('clamps to the last day of shorter months', () => {
    expect(addMonths(jan31, 1).toISOString().slice(0, 10)).toBe('2028-02-29');
    expect(addMonths(jan31, 3).toISOString().slice(0, 10)).toBe('2028-04-30');
    expect(addMonths(jan31, 13).toISOString().slice(0, 10)).toBe('2029-02-28');
  });

  it("doesn't drift: counted from the original date, Mar 31 stays the 31st", () => {
    expect(addMonths(jan31, 2).toISOString().slice(0, 10)).toBe('2028-03-31');
  });

  it('rolls over the year', () => {
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2027-02-15');
  });

  it('keeps the time of day', () => {
    expect(addMonths(new Date('2026-10-19T13:45:30.123Z'), 1).toISOString()).toBe('2026-11-19T13:45:30.123Z');
  });
});
