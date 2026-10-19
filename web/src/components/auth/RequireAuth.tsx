'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { homeFor } from '@/lib/redirects';
import type { Role } from '@/lib/types';
import { useAuth } from './AuthProvider';

// Client-side route guard.
//
// IMPORTANT: this is UX, not security. The token lives in localStorage, so the
// server can't see it and a Next.js `proxy` can't check it. Anyone can bypass
// browser code — the real protection is the API, which rejects every request
// without a valid token (401) or the right role (403). This guard just stops
// people seeing pages they can't use, and sends them somewhere sensible.
export function RequireAuth({ role, children }: { role: Role; children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const allowed = status === 'authenticated' && user?.role === role;

  useEffect(() => {
    if (status === 'anonymous') {
      // Remember where they were going, so login can bring them straight back
      const next = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    } else if (status === 'authenticated' && user && user.role !== role) {
      // Logged in, wrong area (e.g. a customer opening /admin) → their own home
      router.replace(homeFor(user.role));
    }
  }, [status, user, role, pathname, router]);

  // While loading or redirecting, show a skeleton — never the protected content
  return allowed ? <>{children}</> : <PageSkeleton />;
}
