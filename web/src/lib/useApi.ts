'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

interface ApiState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
}

// Fetch data for a page and expose the three states every data page needs
// (spec: loading, empty, error) plus `reload` for "Try again" buttons.
// Pass `null` as the path to skip fetching (e.g. until an id is known).
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<ApiState<T>>({ data: undefined, error: null, loading: path !== null });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (path === null) return;
    // Cancel the request if the page goes away or the path changes first
    const controller = new AbortController();

    async function load(url: string) {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await api.get<T>(url, { signal: controller.signal });
        setState({ data, error: null, loading: false });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const error = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.');
        setState((s) => ({ ...s, error, loading: false }));
      }
    }

    void load(path);
    return () => controller.abort();
    // reloadCount: bumping it re-runs this effect (manual refresh)
  }, [path, reloadCount]);

  const reload = useCallback(() => setReloadCount((n) => n + 1), []);

  return { ...state, reload };
}
