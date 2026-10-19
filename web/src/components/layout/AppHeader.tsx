'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Logo } from '@/components/brand/Logo';
import { homeFor } from '@/lib/redirects';
import { isActive, NAV_ITEMS } from './navigation';
import { UserMenu } from './UserMenu';

export function AppHeader() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Escape closes the mobile menu
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  if (!user) return null;
  const items = NAV_ITEMS[user.role];

  return (
    // Sticky + translucent: stays reachable while scrolling long pages (e.g. schedules)
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href={homeFor(user.role)} aria-label="LendLite home" onClick={() => setMobileOpen(false)}>
          <Logo />
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:block">
            <UserMenu />
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="rounded-lg p-2 text-ink transition hover:bg-canvas md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              {mobileOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div id="mobile-menu" className="border-t border-line bg-surface px-4 pb-4 pt-2 md:hidden">
          <nav aria-label="Main" className="flex flex-col">
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-lg px-3 py-3 text-sm font-medium ${active ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-canvas'}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 border-t border-line pt-3">
            <p className="px-3 text-sm font-semibold text-ink">{user.fullName}</p>
            <p className="px-3 text-xs text-muted">{user.email}</p>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                logout();
              }}
              className="mt-2 w-full rounded-lg px-3 py-3 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
