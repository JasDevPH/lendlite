import { SessionPlaceholder } from '@/components/auth/SessionPlaceholder';

export const metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return <SessionPlaceholder area="Customer dashboard" />;
}
