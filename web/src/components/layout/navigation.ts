import type { Role } from '@/lib/types';

export interface NavItem {
  href: string;
  label: string;
  // Exact match only (so "/admin" isn't highlighted on "/admin/applications/…")
  exact?: boolean;
}

// Links shown in the header for each role — one list, used by desktop + mobile menus
export const NAV_ITEMS: Record<Role, NavItem[]> = {
  CUSTOMER: [
    { href: '/dashboard', label: 'My applications', exact: true },
    { href: '/applications/new', label: 'New application' },
  ],
  ADMIN: [{ href: '/admin', label: 'Review queue' }],
};

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

// "Casey Customer" → "CC"
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase();
}
