import type { ApiErrorBody } from './types';

// NEXT_PUBLIC_* vars are inlined into the browser bundle at build time.
// Must be referenced literally (not process.env[name]) for that to work.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1';

// Every failed request becomes an ApiError, so UI code handles ONE error type
// and can switch on `code` (e.g. 'EMAIL_TAKEN', 'INVALID_STATUS_TRANSITION').
export class ApiError extends Error {
  constructor(
    public readonly status: number, // HTTP status; 0 = never reached the server
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  // Per-field messages from a 400 VALIDATION_ERROR, e.g. { email: 'Invalid email address' }
  fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_ERROR' || !Array.isArray(this.details)) return {};
    const errors: Record<string, string> = {};
    for (const item of this.details as Array<{ path?: string; message?: string }>) {
      if (item.path && item.message && !errors[item.path]) errors[item.path] = item.message;
    }
    return errors;
  }
}

// ---------- Auth token (in memory) ----------
// The auth layer (lib/auth.ts) owns persistence; this module just attaches
// whatever token it's given. Keeps the HTTP client free of storage concerns.
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

// Called on any 401 from an authenticated request (expired/invalid token),
// so the app can log the user out in one place
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// ---------- Core request ----------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown; // plain object → JSON; FormData → multipart (file upload)
  headers?: Record<string, string>;
  signal?: AbortSignal;
  // Don't trigger the global "401 → log out" handler (used when checking a
  // stored token at startup: a stale token should be dropped quietly)
  skipUnauthorizedHandler?: boolean;
}

export interface GetOptions {
  signal?: AbortSignal;
  skipUnauthorizedHandler?: boolean;
}

export interface PostOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, signal, skipUnauthorizedHandler = false } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  // For FormData, let the browser set Content-Type (it adds the multipart boundary)
  if (body !== undefined && !isFormData) finalHeaders['Content-Type'] = 'application/json';
  if (authToken) finalHeaders.Authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Server down, CORS blocked, offline…
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach LendLite. Check your connection and try again.');
  }

  // Our API always replies with JSON; guard anyway (e.g. a proxy's HTML error page)
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: ApiErrorBody } | null;

  if (!response.ok) {
    if (response.status === 401 && authToken && !skipUnauthorizedHandler) onUnauthorized?.();
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? `Request failed (${response.status})`,
      error?.details,
    );
  }

  // Success responses are { data: ... }; hand callers the data directly
  return payload?.data as T;
}

export const api = {
  get: <T>(path: string, options: GetOptions = {}) => request<T>(path, options),
  post: <T>(path: string, body?: unknown, options: PostOptions = {}) =>
    request<T>(path, { method: 'POST', body, ...options }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  // Multipart upload (FormData with a `file` field)
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),

  // File download: needs the auth header, so a plain <a href> won't work.
  // Fetch as a Blob, then let the caller save/open it.
  async download(path: string): Promise<Blob> {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach LendLite. Check your connection and try again.');
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: ApiErrorBody } | null;
      throw new ApiError(response.status, payload?.error?.code ?? 'UNKNOWN_ERROR', payload?.error?.message ?? 'Download failed');
    }
    return response.blob();
  },
};
