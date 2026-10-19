'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setAuthToken, setUnauthorizedHandler } from '@/lib/api';
import { clearStoredToken, readStoredToken, storeToken, TOKEN_STORAGE_KEY } from '@/lib/auth';
import type { AuthResult, User } from '@/lib/types';

// 'loading' until we've checked localStorage (and /auth/me) in the browser.
// Pages must wait for it before deciding "logged in or not", or they'd flash
// the login page for a moment on every refresh.
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  const logout = useCallback(() => {
    clearStoredToken();
    setAuthToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  // Shared by login + register: both return { token, user }
  const startSession = useCallback((result: AuthResult) => {
    storeToken(result.token);
    setAuthToken(result.token);
    setUser(result.user);
    setStatus('authenticated');
    return result.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => startSession(await api.post<AuthResult>('/auth/login', { email, password })),
    [startSession],
  );

  const register = useCallback(
    async (input: RegisterInput) => startSession(await api.post<AuthResult>('/auth/register', input)),
    [startSession],
  );

  // On first load in the browser: restore the session from localStorage and
  // confirm the token is still valid (it may have expired after 1h)
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = readStoredToken();
      if (!token) {
        setStatus('anonymous');
        return;
      }
      setAuthToken(token);
      try {
        const me = await api.get<User>('/auth/me');
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch (err) {
        if (cancelled) return;
        // Expired/invalid token → forget it. (Network errors: keep the token so
        // the user isn't logged out just because they were briefly offline.)
        if (err instanceof ApiError && err.status === 401) clearStoredToken();
        setAuthToken(null);
        setStatus('anonymous');
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Any 401 from an authenticated API call (e.g. token expired mid-session) → log out
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Logging out in one tab logs out every open tab (the 'storage' event only
  // fires in OTHER tabs of the same site)
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === TOKEN_STORAGE_KEY && event.newValue === null) logout();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [logout]);

  // Memoised so consumers only re-render when auth state actually changes
  const value = useMemo(() => ({ status, user, login, register, logout }), [status, user, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
