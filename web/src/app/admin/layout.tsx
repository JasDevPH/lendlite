import { Suspense } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

// Every page under /admin requires a logged-in ADMIN.
// Suspense: see app/(customer)/layout.tsx (usePathname on dynamic routes).
export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RequireAuth role="ADMIN">
        <AppShell>{children}</AppShell>
      </RequireAuth>
    </Suspense>
  );
}
