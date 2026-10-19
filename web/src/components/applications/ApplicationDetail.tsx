'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { DocumentFileItem } from '@/components/documents/DocumentFileItem';
import { Alert } from '@/components/ui/Alert';
import { Button, buttonClasses } from '@/components/ui/Button';
import { DetailRow, InfoCard } from '@/components/ui/InfoCard';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { formatCents, formatCentsWhole, formatDate, formatMonths, formatRate } from '@/lib/format';
import { STATUS_META } from '@/lib/status';
import type { LoanApplicationDetail } from '@/lib/types';
import { useApi } from '@/lib/useApi';
import { EMPLOYMENT_OPTIONS } from '@/lib/validation/application';
import { RepaymentSchedule } from './RepaymentSchedule';
import { StatusBadge } from './StatusBadge';
import { StatusTimeline } from './StatusTimeline';

export function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const justSubmitted = useSearchParams().get('submitted') === '1';
  const { data: app, error, loading, reload } = useApi<LoanApplicationDetail>(`/applications/${id}`);

  if (loading && !app) return <PageSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert tone="error" title={error.status === 404 ? 'Application not found' : "We couldn't load this application"}>
          <p>{error.status === 404 ? "This application doesn't exist or isn't yours." : error.message}</p>
          <div className="mt-3 flex gap-2">
            {error.status !== 404 && (
              <Button variant="secondary" onClick={reload}>
                Try again
              </Button>
            )}
            <Link href="/dashboard" className={buttonClasses({ variant: 'secondary' })}>
              Back to dashboard
            </Link>
          </div>
        </Alert>
      </div>
    );
  }
  if (!app) return null;

  const approved = app.status === 'APPROVED' && app.schedule.length > 0;
  const totalInterest = app.schedule.reduce((sum, i) => sum + i.interestCents, 0);
  const monthly = app.schedule[0]?.paymentCents;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-muted hover:text-ink">
          ← My applications
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">{app.purpose}</p>
            <h1 className="money mt-1 text-3xl font-semibold tracking-tight text-ink">{formatCentsWhole(app.amountCents)}</h1>
            <p className="mt-1 text-sm text-muted">
              {formatMonths(app.termMonths)} · Ref {app.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <StatusBadge status={app.status} />
        </div>
      </div>

      {justSubmitted && app.status === 'SUBMITTED' && (
        <Alert tone="success" title="Application submitted">
          Thanks! We&apos;ve received your application and documents. A lending specialist will review it and you can track progress here.
        </Alert>
      )}
      {app.status === 'DRAFT' && (
        <Alert tone="info" title="This application hasn't been submitted yet">
          <Link href={`/applications/new?draft=${app.id}`} className={`${buttonClasses()} mt-2`}>
            Continue application
          </Link>
        </Alert>
      )}
      {app.status === 'REJECTED' && (
        <Alert tone="error" title="Your application was declined">
          {app.rejectionReason && <p data-testid="rejection-reason">{app.rejectionReason}</p>}
          <p className="mt-2">You&apos;re welcome to apply again if your circumstances change.</p>
        </Alert>
      )}

      {/* grid-cols-1 (= minmax(0,1fr)) + min-w-0: without them the implicit grid
          column grows to the table's min width and the PAGE scrolls sideways on
          phones, instead of just the table */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          {approved && (
            <InfoCard title="Your loan">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Interest rate" value={formatRate(app.annualRateBps!)} />
                <Stat label="Monthly payment" value={monthly !== undefined ? formatCents(monthly) : '—'} />
                <Stat label="Total interest" value={formatCents(totalInterest)} />
                <Stat label="Total repayable" value={formatCents(app.amountCents + totalInterest)} />
              </dl>
            </InfoCard>
          )}

          {approved && (
            <InfoCard title="Repayment schedule">
              <RepaymentSchedule schedule={app.schedule} applicationId={app.id} />
            </InfoCard>
          )}

          <InfoCard title="Your details">
            <dl className="divide-y divide-line text-sm">
              <DetailRow label="Loan purpose" value={app.purpose} />
              <DetailRow label="Employment" value={EMPLOYMENT_OPTIONS.find((o) => o.value === app.employmentType)?.label ?? '—'} />
              {app.employerName && app.employmentType !== 'UNEMPLOYED' && <DetailRow label="Employer" value={app.employerName} />}
              <DetailRow label="Annual income" value={app.annualIncomeCents === null ? '—' : formatCents(app.annualIncomeCents)} />
              <DetailRow label="Monthly expenses" value={app.monthlyExpensesCents === null ? '—' : formatCents(app.monthlyExpensesCents)} />
            </dl>
          </InfoCard>

          <InfoCard title="Documents">
            {app.documents.length === 0 ? (
              <p className="text-sm text-muted">No documents uploaded.</p>
            ) : (
              <ul className="space-y-2">
                {app.documents.map((doc) => (
                  <DocumentFileItem key={doc.id} document={doc} />
                ))}
              </ul>
            )}
          </InfoCard>
        </div>

        <aside className="space-y-4">
          <InfoCard title="Progress">
            <StatusTimeline application={app} />
          </InfoCard>
          <p className="px-1 text-xs text-subtle">
            {STATUS_META[app.status].customerHint} {app.submittedAt && `Submitted ${formatDate(app.submittedAt)}.`}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="money mt-1 text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}
