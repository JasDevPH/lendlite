'use client';

import Link from 'next/link';
import { ApplicationCard, ApplicationCardSkeleton } from '@/components/applications/ApplicationCard';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCentsWhole } from '@/lib/format';
import type { LoanApplication } from '@/lib/types';
import { useApi } from '@/lib/useApi';

export function Dashboard() {
  const { user } = useAuth();
  // Newest first (the API sorts). Refetches automatically when the user comes
  // back to this page: Next re-runs effects when a hidden page becomes visible.
  const { data: applications, error, loading, reload } = useApi<LoanApplication[]>('/applications');
  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Start a new loan application or check on an existing one."
        actions={
          <Link href="/applications/new" className={buttonClasses()}>
            New application
          </Link>
        }
      />

      {applications && applications.length > 0 && <Summary applications={applications} />}

      <section aria-labelledby="applications-heading">
        <h2 id="applications-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Your applications
        </h2>

        {/* Error state: explain + let them retry (keep any data we already had) */}
        {error && (
          <div className="mb-4">
            <Alert tone="error" title="We couldn't load your applications">
              <p>{error.message}</p>
              <Button variant="secondary" className="mt-3" onClick={reload}>
                Try again
              </Button>
            </Alert>
          </div>
        )}

        {/* Loading state: skeletons shaped like the real cards (no layout jump) */}
        {loading && !applications && (
          <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading applications">
            <ApplicationCardSkeleton />
            <ApplicationCardSkeleton />
          </div>
        )}

        {/* Empty state */}
        {applications && applications.length === 0 && (
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title="No applications yet"
            description="Apply for a personal loan from $2,000 to $50,000. It takes a few minutes, and you can save and come back any time."
            action={
              <Link href="/applications/new" className={buttonClasses({ size: 'lg' })}>
                Start an application
              </Link>
            }
          />
        )}

        {/* Data */}
        {applications && applications.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-2">
            {applications.map((application) => (
              <li key={application.id}>
                <ApplicationCard application={application} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// At-a-glance numbers derived from the list (no extra request)
function Summary({ applications }: { applications: LoanApplication[] }) {
  const inProgress = applications.filter((a) => a.status !== 'APPROVED' && a.status !== 'REJECTED').length;
  const approved = applications.filter((a) => a.status === 'APPROVED');
  const approvedTotal = approved.reduce((sum, a) => sum + a.amountCents, 0);

  const items = [
    { label: 'In progress', value: String(inProgress) },
    { label: 'Approved', value: String(approved.length) },
    { label: 'Total approved', value: formatCentsWhole(approvedTotal) },
  ];

  return (
    <dl className="grid grid-cols-3 divide-x divide-line rounded-card border border-line bg-surface shadow-card">
      {items.map((item) => (
        <div key={item.label} className="px-4 py-4 sm:px-6">
          <dt className="text-xs font-medium text-muted sm:text-sm">{item.label}</dt>
          <dd className="money mt-1 text-lg font-semibold text-ink sm:text-2xl">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
