'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { LOAN_LIMITS as L } from '@/lib/loanRules';
import type { LoanApplication, Quote } from '@/lib/types';

// Share of monthly (pre-tax) income going to expenses + this loan's repayment.
// Bands are illustrative for this demo, NOT a real credit policy.
function band(ratio: number): { label: string; tone: string; icon: string } {
  if (ratio < 0.4) return { label: 'Comfortable', tone: 'bg-emerald-50 text-emerald-800', icon: '✓' };
  if (ratio < 0.6) return { label: 'Stretched', tone: 'bg-amber-50 text-amber-900', icon: '!' };
  return { label: 'High', tone: 'bg-rose-50 text-rose-800', icon: '✕' };
}

// Reviewer aid: monthly income vs expenses vs the possible repayment.
// The repayment depends on the rate the admin picks, so it's shown as a range
// (real quotes at the lowest and highest allowed rates).
export function AffordabilitySnapshot({ application }: { application: LoanApplication }) {
  const [range, setRange] = useState<{ low: number; high: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const quote = (annualRateBps: number) =>
      api.post<Quote>('/calculator/quote', { amountCents: application.amountCents, termMonths: application.termMonths, annualRateBps }, { signal: controller.signal });
    Promise.all([quote(L.minRateBps), quote(L.maxRateBps)])
      .then(([low, high]) => setRange({ low: low.monthlyPaymentCents, high: high.monthlyPaymentCents }))
      .catch(() => {
        /* optional aid; the rest of the page doesn't depend on it */
      });
    return () => controller.abort();
  }, [application.amountCents, application.termMonths]);

  const annual = application.annualIncomeCents;
  const expenses = application.monthlyExpensesCents;
  if (annual === null || expenses === null) {
    return <p className="text-sm text-muted">Income or expenses not provided.</p>;
  }

  const monthlyIncome = Math.round(annual / 12);
  // Worst case (highest rate) drives the band; both ends are shown
  const ratioLow = range && monthlyIncome > 0 ? (expenses + range.low) / monthlyIncome : null;
  const ratioHigh = range && monthlyIncome > 0 ? (expenses + range.high) / monthlyIncome : null;
  const assessment = ratioHigh === null ? null : band(ratioHigh);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure label="Monthly income (before tax)" value={formatCents(monthlyIncome)} />
        <Figure label="Monthly expenses" value={formatCents(expenses)} />
        <Figure label="Repayment (5%–25% p.a.)" value={range ? `${formatCents(range.low)} – ${formatCents(range.high)}` : '…'} testId="affordability-repayment" />
      </dl>

      {monthlyIncome === 0 ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">No income declared — repayments can&apos;t be covered from income.</p>
      ) : ratioLow !== null && ratioHigh !== null && assessment ? (
        <div className={`flex flex-col gap-1 rounded-xl px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${assessment.tone}`} data-testid="affordability-band">
          <p>
            <span aria-hidden="true" className="mr-1.5 font-bold">
              {assessment.icon}
            </span>
            <span className="font-semibold">{assessment.label}</span> — expenses + repayment would use{' '}
            <span className="font-semibold">
              {Math.round(ratioLow * 100)}%–{Math.round(ratioHigh * 100)}%
            </span>{' '}
            of monthly income
          </p>
          <p className="text-xs opacity-80">Indicative only — not a credit decision</p>
        </div>
      ) : null}
    </div>
  );
}

function Figure({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-xl bg-canvas px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="money mt-1 font-semibold text-ink" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
