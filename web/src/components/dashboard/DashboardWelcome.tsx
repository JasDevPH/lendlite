'use client';

import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

// Phase 8 dashboard: greeting + empty state. Phase 9 replaces the empty state
// with the real list of the customer's applications (loading/empty/error).
export function DashboardWelcome() {
  const { user } = useAuth();
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

      <section aria-labelledby="applications-heading">
        <h2 id="applications-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Your applications
        </h2>
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
      </section>
    </div>
  );
}
