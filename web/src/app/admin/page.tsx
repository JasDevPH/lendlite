import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: 'Review queue' };

// Phase 8 admin landing. Phase 10 adds stats cards + the filterable applications table.
export default function AdminPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Review queue" description="Applications waiting for a decision, and portfolio stats." />
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" strokeLinecap="round" />
          </svg>
        }
        title="Admin tools are on the way"
        description="Stats, the review queue and decision actions are added in the admin UI phase."
      />
    </div>
  );
}
