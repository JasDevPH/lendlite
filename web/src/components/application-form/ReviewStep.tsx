'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { DocumentFileItem } from '@/components/documents/DocumentFileItem';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { DOCUMENT_TYPES } from '@/lib/documents';
import { formatCents, formatCentsWhole, formatMonths } from '@/lib/format';
import { LOAN_LIMITS as L } from '@/lib/loanRules';
import type { LoanApplication, LoanApplicationDetail, Quote } from '@/lib/types';
import { EMPLOYMENT_OPTIONS } from '@/lib/validation/application';

type EditableStep = 'details' | 'employment' | 'documents';

interface Props {
  application: LoanApplicationDetail;
  onEdit: (step: EditableStep) => void;
  onSubmitted: (application: LoanApplication) => void;
}

// Readable names for the API's field codes (shown if submit says something's missing)
const FIELD_LABELS: Record<string, string> = {
  purpose: 'Loan purpose',
  employmentType: 'Employment status',
  employerName: 'Employer name',
  annualIncomeCents: 'Annual income',
  monthlyExpensesCents: 'Monthly expenses',
};

// Step 4: check everything, confirm, submit (idempotently).
export function ReviewStep({ application, onEdit, onSubmitted }: Props) {
  const confirmId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; body: ReactNode } | null>(null);
  const [range, setRange] = useState<{ low: number; high: number } | null>(null);

  // ONE idempotency key per visit to this step, reused for every retry.
  // If the first request reached the server but the response was lost
  // (or the user double-clicks), the API sees the same key and replays the
  // original result instead of failing or submitting twice.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  // Repayment range: the rate is only set at approval, so show the
  // repayment at the lowest and highest possible rates (real quotes from the API)
  useEffect(() => {
    const controller = new AbortController();
    const quote = (annualRateBps: number) =>
      api.post<Quote>(
        '/calculator/quote',
        { amountCents: application.amountCents, termMonths: application.termMonths, annualRateBps },
        { signal: controller.signal },
      );
    Promise.all([quote(L.minRateBps), quote(L.maxRateBps)])
      .then(([low, high]) => setRange({ low: low.monthlyPaymentCents, high: high.monthlyPaymentCents }))
      .catch(() => {
        /* the estimate is a nice-to-have; the review still works without it */
      });
    return () => controller.abort();
  }, [application.amountCents, application.termMonths]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const submitted = await api.post<LoanApplication>(`/applications/${application.id}/submit`, undefined, {
        headers: { 'Idempotency-Key': idempotencyKey.current },
      });
      onSubmitted(submitted);
    } catch (err) {
      setError(describeSubmitError(err, onEdit));
      setSubmitting(false);
    }
  }

  const employment = EMPLOYMENT_OPTIONS.find((o) => o.value === application.employmentType)?.label ?? '—';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Review &amp; submit</h2>
        <p className="mt-1 text-sm text-muted">Check your details. Once submitted, your application can&apos;t be changed.</p>
      </div>

      {/* Headline numbers */}
      <div className="rounded-xl bg-navy-950 p-5 text-white">
        <p className="text-sm text-white/60">You&apos;re applying for</p>
        <p className="money mt-1 text-3xl font-semibold tracking-tight">{formatCentsWhole(application.amountCents)}</p>
        <p className="mt-1 text-sm text-white/70">over {formatMonths(application.termMonths)}</p>
        <div className="mt-4 border-t border-white/10 pt-4 text-sm">
          <p className="text-white/60">Estimated monthly repayment</p>
          <p className="money mt-0.5 font-semibold" data-testid="repayment-range">
            {range ? `${formatCents(range.low)} – ${formatCents(range.high)}` : 'Calculating…'}
          </p>
          <p className="mt-1 text-xs text-white/50">Depends on the rate you&apos;re approved for (5%–25% p.a.).</p>
        </div>
      </div>

      <Section title="Loan details" onEdit={() => onEdit('details')}>
        <Row label="Amount" value={formatCentsWhole(application.amountCents)} />
        <Row label="Term" value={formatMonths(application.termMonths)} />
        <Row label="Purpose" value={application.purpose} />
      </Section>

      <Section title="Employment & income" onEdit={() => onEdit('employment')}>
        <Row label="Employment status" value={employment} />
        {application.employmentType !== 'UNEMPLOYED' && (
          <Row label={application.employmentType === 'SELF_EMPLOYED' ? 'Business name' : 'Employer'} value={application.employerName ?? '—'} />
        )}
        <Row label="Annual income (before tax)" value={application.annualIncomeCents === null ? '—' : formatCents(application.annualIncomeCents)} />
        <Row label="Monthly expenses" value={application.monthlyExpensesCents === null ? '—' : formatCents(application.monthlyExpensesCents)} />
      </Section>

      <Section title="Documents" onEdit={() => onEdit('documents')}>
        {application.documents.length === 0 ? (
          <p className="py-2 text-sm text-muted">No documents uploaded.</p>
        ) : (
          <ul className="space-y-2 py-2">
            {application.documents.map((doc) => (
              <DocumentFileItem key={doc.id} document={doc} />
            ))}
          </ul>
        )}
      </Section>

      {error && (
        <Alert tone="error" title={error.title}>
          {error.body}
        </Alert>
      )}

      {/* Declaration: a normal step in credit applications */}
      <div className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-4">
        <input
          id={confirmId}
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand-600"
        />
        <label htmlFor={confirmId} className="text-sm text-ink">
          I confirm the information I&apos;ve provided is true and correct, and I understand LendLite will use it to assess my application.
        </label>
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="secondary" onClick={() => onEdit('documents')} disabled={submitting}>
          ← Back
        </Button>
        <Button type="button" size="lg" onClick={submit} loading={submitting} disabled={!confirmed}>
          {submitting ? 'Submitting…' : 'Submit application'}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line" aria-label={title}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <button type="button" onClick={onEdit} className="text-sm font-semibold text-brand-600 hover:text-brand-700" aria-label={`Edit ${title.toLowerCase()}`}>
          Edit
        </button>
      </div>
      <dl className="divide-y divide-line px-4">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="money text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

// Turn the API's submit errors into a helpful message (with links to fix them)
function describeSubmitError(err: unknown, onEdit: (step: EditableStep) => void): { title: string; body: ReactNode } {
  if (!(err instanceof ApiError)) return { title: 'Something went wrong', body: 'Please try again.' };

  if (err.code === 'APPLICATION_INCOMPLETE') {
    const details = err.details as { missingFields?: string[]; missingDocuments?: string[] } | undefined;
    const fields = details?.missingFields ?? [];
    const docs = details?.missingDocuments ?? [];
    return {
      title: 'A few things are still missing',
      body: (
        <ul className="mt-1 list-inside list-disc space-y-1">
          {fields.map((f) => (
            <li key={f}>
              {FIELD_LABELS[f] ?? f} —{' '}
              <button type="button" className="font-semibold underline" onClick={() => onEdit(f === 'purpose' ? 'details' : 'employment')}>
                add it
              </button>
            </li>
          ))}
          {docs.map((d) => (
            <li key={d}>
              {DOCUMENT_TYPES.find((t) => t.type === d)?.title ?? d} —{' '}
              <button type="button" className="font-semibold underline" onClick={() => onEdit('documents')}>
                upload it
              </button>
            </li>
          ))}
        </ul>
      ),
    };
  }
  if (err.code === 'INVALID_STATUS_TRANSITION') {
    return { title: 'Already submitted', body: 'This application has already been submitted.' };
  }
  // Network error etc.: retrying is safe — the same Idempotency-Key is reused
  return { title: "We couldn't submit your application", body: `${err.message} You can safely try again.` };
}
