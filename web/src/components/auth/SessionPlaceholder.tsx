'use client';

import Link from 'next/link';
import { Button, buttonClasses } from '@/components/ui/Button';
import { useAuth } from './AuthProvider';

// TEMPORARY (Phase 8.4): proves login/logout end to end. Replaced by the route
// guard (8.5), app layout/nav (8.6) and the real dashboard/admin pages (Phases 9–10).
export function SessionPlaceholder({ area }: { area: string }) {
  const { status, user, logout } = useAuth();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <div className="rounded-card border border-line bg-surface p-8 shadow-card">
        <p className="text-sm font-medium text-muted">{area}</p>
        {status === 'loading' && <p className="mt-2 text-ink">Checking your session…</p>}
        {status === 'anonymous' && (
          <>
            <p className="mt-2 text-ink">You&apos;re not logged in.</p>
            <Link href="/login" className={`${buttonClasses()} mt-6`}>
              Log in
            </Link>
          </>
        )}
        {status === 'authenticated' && user && (
          <>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight" data-testid="welcome">
              Welcome, {user.fullName}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {user.email} · {user.role}
            </p>
            <Button variant="secondary" className="mt-6" onClick={logout}>
              Log out
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
