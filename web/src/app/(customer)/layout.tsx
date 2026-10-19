import { RequireAuth } from '@/components/auth/RequireAuth';

// Route group "(customer)": every page inside (/dashboard, /applications/…)
// requires a logged-in CUSTOMER. The group name doesn't appear in URLs.
export default function CustomerLayout({ children }: LayoutProps<'/'>) {
  return <RequireAuth role="CUSTOMER">{children}</RequireAuth>;
}
