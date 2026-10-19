import { StatsOverview } from '@/components/admin/StatsOverview';
import { PageHeader } from '@/components/layout/PageHeader';

export const metadata = { title: 'Review queue' };

// Admin home: stats overview (10.1). The filterable applications table is added next (10.2).
export default function AdminPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Review queue" description="Applications waiting for a decision, and portfolio stats." />
      <StatsOverview />
    </div>
  );
}
