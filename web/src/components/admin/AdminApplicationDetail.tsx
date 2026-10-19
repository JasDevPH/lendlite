'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLayoutEffect, useState } from 'react';
import { RepaymentSchedule } from '@/components/applications/RepaymentSchedule';
import { StatusBadge } from '@/components/applications/StatusBadge';
import { DocumentFileItem } from '@/components/documents/DocumentFileItem';
import { Alert } from '@/components/ui/Alert';
import { Button, buttonClasses } from '@/components/ui/Button';
import { DetailRow, InfoCard } from '@/components/ui/InfoCard';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { api, ApiError } from '@/lib/api';
import { DOCUMENT_TYPES } from '@/lib/documents';
import { formatCents, formatCentsWhole, formatDate, formatDateTime, formatMonths, formatRate } from '@/lib/format';
import type { LoanApplication, LoanApplicationDetail } from '@/lib/types';
import { useApi } from '@/lib/useApi';
import { EMPLOYMENT_OPTIONS } from '@/lib/validation/application';
import { AffordabilitySnapshot } from './AffordabilitySnapshot';
import { ApproveDialog } from './ApproveDialog';
import { AuditTrail } from './AuditTrail';
import { RejectDialog } from './RejectDialog';

export function AdminApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: app, error, loading, reload } = useApi<LoanApplicationDetail>(`/applications/${id}`);

  if (loading && !app) return <PageSkeleton />;
  if (error) {
    return (
      <Alert tone="error" title={error.status === 404 ? 'Application not found' : "We couldn't load this application"}>
        <p>{error.status === 404 ? "This application doesn't exist." : error.message}</p>
        <div className="mt-3 flex gap-2">
          {error.status !== 404 && (
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          )}
          <Link href="/admin" className={buttonClasses({ variant: 'secondary' })}>
            Back to review queue
          </Link>
        </div>
      </Alert>
    );
  }
  if (!app) return null;

  const employment = EMPLOYMENT_OPTIONS.find((o) => o.value === app.employmentType)?.label ?? '—';
  const missingDocs = DOCUMENT_TYPES.filter((t) => t.required && !app.documents.some((d) => d.type === t.type));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm font-medium text-muted hover:text-ink">
          ← Review queue
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">
              {app.user.fullName} · {app.user.email}
            </p>
            <h1 className="money mt-1 text-3xl font-semibold tracking-tight text-ink">{formatCentsWhole(app.amountCents)}</h1>
            <p className="mt-1 text-sm text-muted">
              {app.purpose} · {formatMonths(app.termMonths)} · Ref {app.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <StatusBadge status={app.status} />
        </div>
      </div>

      <ActionPanel application={app} onChanged={reload} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <InfoCard title="Affordability">
            <AffordabilitySnapshot application={app} />
          </InfoCard>

          {app.status === 'APPROVED' && app.schedule.length > 0 && (
            <InfoCard title="Repayment schedule">
              <RepaymentSchedule schedule={app.schedule} applicationId={app.id} />
            </InfoCard>
          )}

          <InfoCard title="Documents">
            {missingDocs.length > 0 && (
              <p className="mb-3 text-sm text-amber-800">Missing: {missingDocs.map((d) => d.title).join(', ')}</p>
            )}
            {app.documents.length === 0 ? (
              <p className="text-sm text-muted">No documents uploaded.</p>
            ) : (
              <ul className="space-y-2">
                {app.documents.map((doc) => (
                  <li key={doc.id} className="list-none">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-subtle">{DOCUMENT_TYPES.find((t) => t.type === doc.type)?.title ?? doc.type}</p>
                    <ul>
                      <DocumentFileItem document={doc} />
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </InfoCard>

          <InfoCard title="Audit trail">
            {/* key: every status change bumps updatedAt → remount → fresh trail */}
            <AuditTrail key={app.updatedAt} applicationId={app.id} />
          </InfoCard>
        </div>

        <aside className="space-y-6">
          <InfoCard title="Loan">
            <dl className="divide-y divide-line text-sm">
              <DetailRow label="Amount" value={formatCentsWhole(app.amountCents)} />
              <DetailRow label="Term" value={formatMonths(app.termMonths)} />
              <DetailRow label="Purpose" value={app.purpose} />
              {app.annualRateBps !== null && <DetailRow label="Approved rate" value={formatRate(app.annualRateBps)} />}
            </dl>
          </InfoCard>
          <InfoCard title="Applicant">
            <dl className="divide-y divide-line text-sm">
              <DetailRow label="Name" value={app.user.fullName} />
              <DetailRow label="Email" value={<span className="break-all">{app.user.email}</span>} />
              <DetailRow label="Employment" value={employment} />
              {app.employerName && app.employmentType !== 'UNEMPLOYED' && (
                <DetailRow label={app.employmentType === 'SELF_EMPLOYED' ? 'Business' : 'Employer'} value={app.employerName} />
              )}
              <DetailRow label="Annual income" value={app.annualIncomeCents === null ? '—' : formatCents(app.annualIncomeCents)} />
              <DetailRow label="Monthly expenses" value={app.monthlyExpensesCents === null ? '—' : formatCents(app.monthlyExpensesCents)} />
            </dl>
          </InfoCard>
          <InfoCard title="Dates">
            <dl className="divide-y divide-line text-sm">
              <DetailRow label="Started" value={formatDate(app.createdAt)} />
              <DetailRow label="Submitted" value={app.submittedAt ? formatDateTime(app.submittedAt) : '—'} />
              <DetailRow label="Decided" value={app.decidedAt ? formatDateTime(app.decidedAt) : '—'} />
            </dl>
          </InfoCard>
        </aside>
      </div>
    </div>
  );
}

// What the admin can do next depends on the status (mirrors the API's status machine)
function ActionPanel({ application, onChanged }: { application: LoanApplicationDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);

  // Decision dialogs are transient: if Next hides this page (Activity), close
  // them so they're never restored half-open (Next "Preserving UI state" guide)
  useLayoutEffect(() => () => setDialog(null), []);

  function decided() {
    setDialog(null);
    onChanged();
  }

  async function startReview() {
    setBusy(true);
    setError(null);
    try {
      await api.post<LoanApplication>(`/admin/applications/${application.id}/start-review`);
      onChanged();
    } catch (err) {
      // e.g. 409 if another admin started it a moment ago — refresh to show the real state
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const panel = 'flex flex-col gap-3 rounded-card border p-5 sm:flex-row sm:items-center sm:justify-between';

  switch (application.status) {
    case 'SUBMITTED':
      return (
        <div className={`${panel} border-brand-200 bg-brand-50`}>
          <div>
            <p className="font-semibold text-brand-900">Ready for review</p>
            <p className="text-sm text-brand-900/80">Start the review to take ownership of this application. The customer will see it&apos;s being assessed.</p>
            {error && (
              <p role="alert" className="mt-1 text-sm text-rose-700">
                {error}
              </p>
            )}
          </div>
          <Button onClick={startReview} loading={busy}>
            {busy ? 'Starting…' : 'Start review'}
          </Button>
        </div>
      );
    case 'UNDER_REVIEW':
      return (
        <div className={`${panel} border-amber-200 bg-amber-50`}>
          <div>
            <p className="font-semibold text-amber-900">Ready for a decision</p>
            <p className="text-sm text-amber-900/80">Check affordability and documents, then approve with a rate or decline with a reason.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => setDialog('reject')}>
              Decline
            </Button>
            <Button onClick={() => setDialog('approve')}>Approve</Button>
          </div>
          {/* Mounted only while open → a fresh form every time */}
          {dialog === 'approve' && <ApproveDialog application={application} open onClose={() => setDialog(null)} onDecided={decided} />}
          {dialog === 'reject' && <RejectDialog application={application} open onClose={() => setDialog(null)} onDecided={decided} />}
        </div>
      );
    case 'APPROVED':
      return (
        <Alert tone="success" title={`Approved at ${formatRate(application.annualRateBps!)}`}>
          Decided {application.decidedAt ? formatDateTime(application.decidedAt) : ''}. The repayment schedule is below.
        </Alert>
      );
    case 'REJECTED':
      return (
        <Alert tone="error" title="Declined">
          <p data-testid="admin-rejection-reason">{application.rejectionReason}</p>
          <p className="mt-1 text-xs">Decided {application.decidedAt ? formatDateTime(application.decidedAt) : ''}</p>
        </Alert>
      );
    case 'DRAFT':
      return <Alert tone="info" title="Draft">The customer hasn&apos;t submitted this application yet, so it can&apos;t be reviewed.</Alert>;
  }
}
