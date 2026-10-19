import Link from 'next/link';
import { formatCentsWhole, formatDate, formatMonths, formatRate } from '@/lib/format';
import { STATUS_META } from '@/lib/status';
import type { LoanApplication } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

// What the card's call-to-action says for each status
const ACTION_LABEL: Record<LoanApplication['status'], string> = {
  DRAFT: 'Continue application',
  SUBMITTED: 'View application',
  UNDER_REVIEW: 'View application',
  APPROVED: 'View repayment schedule',
  REJECTED: 'View details',
};

export function ApplicationCard({ application }: { application: LoanApplication }) {
  const { id, status, purpose, amountCents, termMonths, annualRateBps, createdAt, submittedAt, decidedAt } = application;

  // The most relevant date for where the application is up to
  const dateLabel = decidedAt
    ? `Decided ${formatDate(decidedAt)}`
    : submittedAt
      ? `Submitted ${formatDate(submittedAt)}`
      : `Started ${formatDate(createdAt)}`;

  return (
    <Link
      // Drafts reopen the application form; everything else shows the detail page
      href={status === 'DRAFT' ? `/applications/new?draft=${id}` : `/applications/${id}`}
      // The whole card is one link: a large, easy target (especially on mobile)
      className="group flex flex-col rounded-card border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted">{purpose}</p>
          <p className="money mt-1 text-2xl font-semibold tracking-tight text-ink">{formatCentsWhole(amountCents)}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <dl className="money mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted">Term</dt>
          <dd className="font-medium text-ink">{formatMonths(termMonths)}</dd>
        </div>
        {annualRateBps !== null && (
          <div className="flex gap-1.5">
            <dt className="text-muted">Rate</dt>
            <dd className="font-medium text-ink">{formatRate(annualRateBps)}</dd>
          </div>
        )}
      </dl>

      <p className="mt-3 text-sm text-muted">{STATUS_META[status].customerHint}</p>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm">
        <span className="text-subtle">{dateLabel}</span>
        <span className="font-semibold text-brand-600 group-hover:text-brand-700">
          {ACTION_LABEL[status]} <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}

export function ApplicationCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card" aria-hidden="true">
      <div className="flex justify-between">
        <div>
          <div className="h-3.5 w-28 animate-pulse rounded bg-line/70" />
          <div className="mt-2 h-7 w-24 animate-pulse rounded bg-line/70" />
        </div>
        <div className="h-6 w-20 animate-pulse rounded-full bg-line/60" />
      </div>
      <div className="mt-5 h-3.5 w-40 animate-pulse rounded bg-line/50" />
      <div className="mt-6 h-3.5 w-full animate-pulse rounded bg-line/40" />
    </div>
  );
}
