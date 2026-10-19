import { RequireAuth } from '@/components/auth/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';

// Route group "(customer)": every page inside (/dashboard, /applications/…)
// requires a logged-in CUSTOMER and gets the app header/footer.
// The group name doesn't appear in URLs.
export default function CustomerLayout({ children }: LayoutProps<'/'>) {
  return (
    <RequireAuth role="CUSTOMER">
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
