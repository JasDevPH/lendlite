import { RequireAuth } from '@/components/auth/RequireAuth';

// Every page under /admin requires a logged-in ADMIN
export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return <RequireAuth role="ADMIN">{children}</RequireAuth>;
}
