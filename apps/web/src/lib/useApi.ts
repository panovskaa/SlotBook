import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError } from '../api/client';

export type ApiState<T> =
  | {
      status: 'loading';
      /** The last data that loaded, if any, so a page can keep showing it while the next request runs. */
      previous?: T;
    }
  | { status: 'error'; error: ApiRequestError }
  | { status: 'ready'; data: T };

/** Loads data when a key changes, cancels stale requests, and offers a retry. */
export function useApi<T>(load: (signal: AbortSignal) => Promise<T>, key: string): ApiState<T> & { retry: () => void } {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // A new key or a retry starts a new request. The old data is passed along as `previous`;
    // each page decides whether to keep showing it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({
      status: 'loading',
      previous: prev.status === 'ready' ? prev.data : prev.status === 'loading' ? prev.previous : undefined,
    }));
    load(controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', error: err instanceof ApiRequestError ? err : new ApiRequestError(0, null) });
      });
    return () => controller.abort();
    // `load` is recreated each render; `key` says when the request actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
