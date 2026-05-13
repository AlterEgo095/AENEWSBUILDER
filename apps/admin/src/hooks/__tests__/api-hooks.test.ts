import { useState, useEffect, useCallback, useRef } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

class TestApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = 'ApiError'; this.status = status; }
}

function useApiInline<T>(fetcher: () => Promise<T>, options: any = {}) {
  const { immediate = true, onSuccess, onError } = options;
  const [state, setState] = useState({ data: null as T | null, loading: immediate, error: null as string | null });
  const mountedRef = useRef(true);
  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetcher();
      if (mountedRef.current) { setState({ data, loading: false, error: null }); onSuccess?.(data); }
    } catch (err: any) {
      if (mountedRef.current) {
        const message = err instanceof TestApiError ? err.message : 'An unexpected error occurred';
        setState({ data: null, loading: false, error: message }); onError?.(message);
      }
    }
  }, [fetcher, onSuccess, onError]);
  useEffect(() => { mountedRef.current = true; if (immediate) execute(); return () => { mountedRef.current = false; }; }, [execute, immediate]);
  const refetch = useCallback(() => execute(), [execute]);
  return { ...state, refetch };
}

describe('useApi', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('test1', async () => {
    const f = vi.fn().mockResolvedValue({ a: 1 });
    const { result } = renderHook(() => useApiInline(() => f()));
    expect(result.current).toHaveProperty('data');
  });

  it('test2', async () => {
    const f = vi.fn().mockResolvedValue({ b: 2 });
    const { result } = renderHook(() => useApiInline(() => f()));
    await waitFor(() => { expect(result.current.data).toEqual({ b: 2 }); });
  });

  it('test3', async () => {
    const f = vi.fn().mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useApiInline(() => f()));
    await waitFor(() => { expect(result.current.error).toBe('An unexpected error occurred'); });
  });
});
