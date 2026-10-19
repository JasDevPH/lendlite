import { Suspense } from 'react';
import { AdminApplicationDetail } from '@/components/admin/AdminApplicationDetail';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

export const metadata = { title: 'Review application' };

// Dynamic [id] = runtime data → read inside Suspense (see the customer detail page)
export default function AdminApplicationPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminApplicationDetail />
    </Suspense>
  );
}
