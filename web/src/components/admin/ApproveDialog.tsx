'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api';
import { formatCents, formatCentsWhole, formatMonths, formatRate, parseDollarsToCents } from '@/lib/format';
import { LOAN_LIMITS as L } from '@/lib/loanRules';
import type { LoanApplication, Quote } from '@/lib/types';

const PRESETS = [895, 1250, 1595, 1995]; // common example rates (bps)

// "12.5" → 1250 bps. Same string-based parsing as money (percent with 2 decimals
// ≡ basis points), so no floating-point surprises.
function parseRateToBps(input: string): number | null {
  return parseDollarsToCents(input.replace('%', '').trim());
}

interface Props {
  application: LoanApplication;
  open: boolean;
  onClose: () => void;
  onDecided: () => void;
}

export function ApproveDialog({ application, open, onClose, onDecided }: Props) {
  const [rate, setRate] = useState('12.50');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bps = parseRateToBps(rate);
  const rateError =
    bps === null ? 'Enter a rate like 12.5' : bps < L.minRateBps || bps > L.maxRateBps ? 'Rate must be between 5% and 25% p.a.' : null;

  // Live preview of what the customer would pay at this rate (debounced; stale requests aborted)
  useEffect(() => {
    if (!open || rateError || bps === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .post<Quote>('/calculator/quote', { amountCents: application.amountCents, termMonths: application.termMonths, annualRateBps: bps }, { signal: controller.signal })
        .then(setQuote)
        .catch(() => {
          /* preview is informational */
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, bps, rateError, application.amountCents, application.termMonths]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (rateError || bps === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post<LoanApplication>(`/admin/applications/${application.id}/approve`, { annualRateBps: bps });
      onDecided();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      setSubmitting(false);
      // 409: someone else decided first — refresh the page behind the dialog
      if (err instanceof ApiError && err.status === 409) onDecided();
    }
  }

  const previewMatches = quote && !rateError && quote.annualRateBps === bps;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Approve application"
      description={`${formatCentsWhole(application.amountCents)} over ${formatMonths(application.termMonths)}. The repayment schedule is created when you confirm.`}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <TextField
          label="Interest rate (% p.a.)"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          error={rateError ?? undefined}
          hint="Between 5% and 25% p.a."
          autoFocus
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Common rates">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setRate((p / 100).toFixed(2))}
              aria-pressed={bps === p}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${bps === p ? 'border-brand-600 bg-brand-600 text-white' : 'border-line text-muted hover:border-brand-300 hover:text-ink'}`}
            >
              {(p / 100).toFixed(2)}%
            </button>
          ))}
        </div>

        {/* Live preview — aria-live so screen readers hear the updated repayment */}
        <dl className={`grid grid-cols-3 gap-3 rounded-xl bg-navy-950 p-4 text-white transition-opacity ${previewMatches ? '' : 'opacity-60'}`} aria-live="polite">
          <div>
            <dt className="text-xs text-white/60">Monthly</dt>
            <dd className="money mt-1 font-semibold" data-testid="preview-monthly">
              {quote ? formatCents(quote.monthlyPaymentCents) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/60">Total interest</dt>
            <dd className="money mt-1 font-semibold text-emerald-300">{quote ? formatCents(quote.totalInterestCents) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/60">Total repayable</dt>
            <dd className="money mt-1 font-semibold">{quote ? formatCents(quote.totalPaymentCents) : '—'}</dd>
          </div>
        </dl>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={Boolean(rateError)}>
            {submitting ? 'Approving…' : bps !== null && !rateError ? `Approve at ${formatRate(bps)}` : 'Approve'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
