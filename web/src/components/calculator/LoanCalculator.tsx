'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { buttonClasses } from '@/components/ui/Button';
import { RangeField } from '@/components/ui/RangeField';
import { api } from '@/lib/api';
import { formatCents, formatCentsWhole, formatMonths } from '@/lib/format';
import { LOAN_LIMITS as L } from '@/lib/loanRules';
import type { Quote } from '@/lib/types';

const DEBOUNCE_MS = 250;

// Defaults = the spec's worked example. Its quote is pre-filled so the card
// shows real numbers in the prerendered HTML (no empty flash); the API call
// on mount confirms it, and every change after that comes from the API.
const DEFAULTS = { amountCents: 1_000_000, termMonths: 12, annualRateBps: 1_200 };
const DEFAULT_QUOTE: Quote = { ...DEFAULTS, monthlyPaymentCents: 88_849, totalInterestCents: 66_186, totalPaymentCents: 1_066_186 };

type Status = 'idle' | 'loading' | 'error';

export function LoanCalculator() {
  const { status: authStatus, user } = useAuth();
  const [amountCents, setAmountCents] = useState(DEFAULTS.amountCents);
  const [termMonths, setTermMonths] = useState(DEFAULTS.termMonths);
  const [annualRateBps, setAnnualRateBps] = useState(DEFAULTS.annualRateBps);
  const [quote, setQuote] = useState<Quote>(DEFAULT_QUOTE);
  const [status, setStatus] = useState<Status>('idle');

  // Ask the API for a quote whenever an input changes.
  // Debounced: dragging a slider fires dozens of changes; we only send one
  // request after the user pauses. AbortController cancels an in-flight
  // request when a newer one starts, so a slow old response can never
  // overwrite a newer one (a classic race condition).
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const next = await api.post<Quote>('/calculator/quote', { amountCents, termMonths, annualRateBps }, { signal: controller.signal });
        setQuote(next);
        setStatus('idle');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // superseded — ignore
        setStatus('error'); // network down / API error: keep the inputs, show a message
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [amountCents, termMonths, annualRateBps]);

  // Logged-in customers go straight to a pre-filled application; everyone else signs up first
  const applyHref =
    authStatus === 'authenticated' && user?.role === 'CUSTOMER'
      ? `/applications/new?amount=${amountCents}&term=${termMonths}`
      : '/register';

  const stale = status === 'loading';

  return (
    <div className="rounded-card bg-surface p-6 text-ink shadow-raised sm:p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Repayment calculator</h2>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Free estimate</span>
      </div>

      <div className="mt-6 space-y-6">
        <RangeField
          label="Loan amount"
          value={amountCents}
          min={L.minAmountCents}
          max={L.maxAmountCents}
          step={50_000} // $500 steps
          onChange={setAmountCents}
          format={formatCentsWhole}
        />
        <RangeField
          label="Loan term"
          value={termMonths}
          min={L.minTermMonths}
          max={L.maxTermMonths}
          step={1}
          onChange={setTermMonths}
          format={formatMonths}
          minLabel="6 mo"
          maxLabel="60 mo"
        />
        <RangeField
          label="Example interest rate"
          value={annualRateBps}
          min={L.minRateBps}
          max={L.maxRateBps}
          step={25} // 0.25% steps
          onChange={setAnnualRateBps}
          format={(bps) => `${(bps / 100).toFixed(2)}% p.a.`}
          minLabel="5%"
          maxLabel="25%"
        />
      </div>

      {/* Result. aria-live: screen readers announce the new repayment after each change */}
      <div className="mt-8 rounded-xl bg-navy-950 p-5 text-white" aria-live="polite" aria-busy={stale}>
        {status === 'error' ? (
          <p role="alert" className="text-sm text-rose-200">
            We couldn&apos;t calculate your repayment right now. Please try again in a moment.
          </p>
        ) : (
          <div className={`transition-opacity ${stale ? 'opacity-60' : 'opacity-100'}`}>
            <p className="text-sm text-white/60">Estimated monthly repayment</p>
            <p className="money mt-1 text-4xl font-semibold tracking-tight" data-testid="monthly-repayment">
              {formatCents(quote.monthlyPaymentCents)}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-sm">
              <div>
                <dt className="text-white/60">Total interest</dt>
                <dd className="money mt-0.5 font-semibold text-emerald-300" data-testid="total-interest">
                  {formatCents(quote.totalInterestCents)}
                </dd>
              </div>
              <div>
                <dt className="text-white/60">Total repayable</dt>
                <dd className="money mt-0.5 font-semibold">{formatCents(quote.totalPaymentCents)}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <Link href={applyHref} className={`${buttonClasses({ size: 'lg', fullWidth: true })} mt-6`}>
        Apply for {formatCentsWhole(amountCents)}
      </Link>
      <p className="mt-4 text-xs leading-relaxed text-subtle">
        Illustrative only. Your actual rate is set when your application is approved and depends on your circumstances.
      </p>
    </div>
  );
}
