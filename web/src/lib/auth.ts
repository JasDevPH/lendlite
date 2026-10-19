// Token persistence. Spec: keep the JWT in memory (lib/api.ts) + localStorage,
// so a page refresh doesn't log the user out.
//
// Trade-off (be ready to explain): localStorage is readable by ANY JavaScript on
// the page, so an XSS bug could steal the token. Production apps usually keep
// it in an httpOnly, Secure, SameSite cookie instead — invisible to JS — at the
// cost of needing CSRF protection and same-site API hosting. See README.

export const TOKEN_STORAGE_KEY = 'lendlite.token';

// localStorage can throw (private mode, storage disabled, quota) and doesn't
// exist during server prerendering — so every access is guarded.
export function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Still logged in for this tab via the in-memory token; just won't survive a refresh
  }
}

export function clearStoredToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Nothing to clear
  }
}
