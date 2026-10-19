import { Suspense } from 'react';
import { ApplicationDetail } from '@/components/applications/ApplicationDetail';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

export const metadata = { title: 'Application' };

// Dynamic route: [id] isn't known at build time, so params are runtime data.
// Next 16 requires reading them inside a <Suspense> boundary; the client
// component reads the id with useParams().
export default function ApplicationPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApplicationDetail />
    </Suspense>
  );
}
