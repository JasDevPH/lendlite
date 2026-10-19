import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Log in' };

// Server component (exports metadata) rendering the client form. The form is
// part of the prerendered static HTML, so it appears instantly.
export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to check your application or start a new one."
      footer={
        <>
          New to LendLite?{' '}
          <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
