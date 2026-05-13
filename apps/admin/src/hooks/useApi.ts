import { useState, useEffect, useCallback, useRef } from 'react';
import api, { ApiError } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiOptions {
  immediate?: boolean;
  onSuccess?: (data: unknown) => void;
  onError?: (error: string) => void;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  options: UseApiOptions = {},
) {
  const { immediate = true, onSuccess, onError } = options;
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: immediate,
    error: null,
  });
  const mountedRef = useRef(true);
  // Store fetcher in a ref to avoid triggering re-fetch on every render
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (mountedRef.current) {
        setState({ data, loading: false, error: null });
        onSuccess?.(data);
      }
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof ApiError
          ? err.message
          : 'An unexpected error occurred';
        setState({ data: null, loading: false, error: message });
        onError?.(message);
      }
    }
  }, [onSuccess, onError]);

  useEffect(() => {
    mountedRef.current = true;
    if (immediate) {
      execute();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [execute, immediate]);

  const refetch = useCallback(() => {
    execute();
  }, [execute]);

  return {
    ...state,
    refetch,
  };
}

export function usePostApi<TRes>() {
  const [state, setState] = useState<UseApiState<TRes>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (request: () => Promise<TRes>) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await request();
      setState({ data, loading: false, error: null });
      return data;
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : 'An unexpected error occurred';
      setState({ data: null, loading: false, error: message });
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

export function useApiGet<T>(path: string, options?: UseApiOptions) {
  return useApi<T>(
    () => api.get<ApiResponse<T>>(path).then(r => {
      if (!r.success) throw new Error(r.error || 'Request failed');
      return r.data as T;
    }),
    options,
  );
}

export function useApiPost<TReq, TRes>(path: string) {
  const [state, setState] = useState<UseApiState<TRes>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (body: TReq) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await api.post<ApiResponse<TRes>>(path, body);
      if (!res.success) throw new Error(res.error || 'Request failed');
      const data = res.data as TRes;
      setState({ data, loading: false, error: null });
      return data;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Request failed';
      setState({ data: null, loading: false, error: message });
      throw err;
    }
  }, [path]);

  return { ...state, execute };
}


