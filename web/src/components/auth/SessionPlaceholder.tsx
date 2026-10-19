'use client';

import { Button } from '@/components/ui/Button';
import { useAuth } from './AuthProvider';

// TEMPORARY: stands in for the real dashboard/admin pages (Phases 9–10).
// Only ever rendered inside <RequireAuth>, so a user is guaranteed here.
export function SessionPlaceholder({ area }: { area: string }) {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <div className="rounded-card border border-line bg-surface p-8 shadow-card">
        <p className="text-sm font-medium text-muted">{area}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight" data-testid="welcome">
          Welcome, {user.fullName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {user.email} · {user.role}
        </p>
        <Button variant="secondary" className="mt-6" onClick={logout}>
          Log out
        </Button>
      </div>
    </main>
  );
}
