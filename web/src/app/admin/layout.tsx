import { RequireAuth } from '@/components/auth/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';

// Every page under /admin requires a logged-in ADMIN
export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <RequireAuth role="ADMIN">
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
