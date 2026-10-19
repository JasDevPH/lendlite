import { Suspense } from 'react';
import { ApplicationsTable } from '@/components/admin/ApplicationsTable';
import { StatsOverview } from '@/components/admin/StatsOverview';
import { PageHeader } from '@/components/layout/PageHeader';

export const metadata = { title: 'Review queue' };

// Admin home: stats overview + the filterable review queue.
// The table reads its filters from the URL (useSearchParams) → Suspense.
export default function AdminPage() {
  return (
    <div className="space-y-10">
      <PageHeader title="Review queue" description="Applications waiting for a decision, and portfolio stats." />
      <StatsOverview />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-line/30" />}>
        <ApplicationsTable />
      </Suspense>
    </div>
  );
}
