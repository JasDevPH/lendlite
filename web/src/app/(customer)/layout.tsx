import { Suspense } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

// Route group "(customer)": every page inside (/dashboard, /applications/…)
// requires a logged-in CUSTOMER and gets the app header/footer.
// The group name doesn't appear in URLs.
//
// Suspense: the guard and header read the current URL (usePathname). On
// dynamic routes like /applications/[id] that's runtime data, which Next 16
// requires to be read inside a Suspense boundary.
export default function CustomerLayout({ children }: LayoutProps<'/'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RequireAuth role="CUSTOMER">
        <AppShell>{children}</AppShell>
      </RequireAuth>
    </Suspense>
  );
}
