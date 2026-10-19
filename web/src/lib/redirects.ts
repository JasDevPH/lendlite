import type { Role } from './types';

// Where each role lands after logging in
export function homeFor(role: Role): string {
  return role === 'ADMIN' ? '/admin' : '/dashboard';
}

// `?next=` lets us send people back where they were after login. Only allow
// same-site paths: "/dashboard" is fine; "https://evil.com" or "//evil.com"
// would turn our login page into an OPEN REDIRECT (a phishing tool).
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}
