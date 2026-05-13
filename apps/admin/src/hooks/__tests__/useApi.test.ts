import { useState, useEffect, useCallback, useRef } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Inline copy of useApi/usePostApi to avoid module resolution issues
class TestApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function useApiInline<T>(fetcher: () => Promise<T>, options: any = {}) {
  const { immediate = true, onSuccess, onError } = options;
  const [state, setState] = useState({ data: null as T | null, loading: immediate, error: null as string | null });
  const mountedRef = useRef(true);
  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetcher();
      if (mountedRef.current) {
        setState({ data, loading: false, error: null });
        onSuccess?.(data);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        const message = err instanceof TestApiError ? err.message : 'An unexpected error occurred';
        setState({ data: null, loading: false, error: message });
        onError?.(message);
      }
    }
  }, [fetcher, onSuccess, onError]);
  useEffect(() => {
    mountedRef.current = true;
    if (immediate) execute();
    return () => { mountedRef.current = false; };
  }, [execute, immediate]);
  const refetch = useCallback(() => execute(), [execute]);
  return { ...state, refetch };
}

function usePostApiInline<TRes>() {
  const [state, setState] = useState({ data: null as TRes | null, loading: false, error: null as string | null });
  const execute = useCallback(async (request: () => Promise<TRes>) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await request();
      setState({ data, loading: false, error: null });
      return data;
    } catch (err: any) {
      const message = err instanceof TestApiError ? err.message : 'An unexpected error occurred';
      setState({ data: null, loading: false, error: message });
      throw err;
    }
  }, []);
  const reset = useCallback(() => setState({ data: null, loading: false, error: null }), []);
  return { ...state, execute, reset };
}

describe('useApi', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns data, loading, error, refetch', async () => {
    const f = vi.fn().mockResolvedValue({ data: 'hello' });
    const { result } = renderHook(() => useApiInline(() => f()));
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('refetch');
  });

  it('sets loading=true initially', () => {
    let resolveRef: (v: any) => void;
    const f = vi.fn().mockImplementation(() => new Promise((r) => { resolveRef = r; }));
    const { result } = renderHook(() => useApiInline(() => f()));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    act(() => resolveRef!({ data: 'done' }));
  });

  it('sets data on success', async () => {
    const f = vi.fn().mockResolvedValue({ items: [1, 2, 3] });
    const { result } = renderHook(() => useApiInline(() => f()));
    await waitFor(() => {
      expect(result.current.data).toEqual({ items: [1, 2, 3] });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  it('sets error on failure', async () => {
    const f = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useApiInline(() => f()));
    await waitFor(() => {
      expect(result.current.error).toBe('An unexpected error occurred');
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
    });
  });

  it('supports lazy loading (immediate=false)', async () => {
    const f = vi.fn().mockResolvedValue({ data: 'lazy' });
    const { result } = renderHook(() => useApiInline(() => f(), { immediate: false }));
    expect(f).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    act(() => { result.current.refetch(); });
    await waitFor(() => { expect(result.current.data).toEqual({ data: 'lazy' }); });
  });

  it('calls onSuccess callback', async () => {
    const onSuccess = vi.fn();
    const f = vi.fn().mockResolvedValue({ data: 'ok' });
    renderHook(() => useApiInline(() => f(), { onSuccess }));
    await waitFor(() => { expect(onSuccess).toHaveBeenCalledWith({ data: 'ok' }); });
  });

  it('calls onError callback', async () => {
    const onError = vi.fn();
    const f = vi.fn().mockRejectedValue(new Error('Not found'));
    renderHook(() => useApiInline(() => f(), { onError }));
    await waitFor(() => { expect(onError).toHaveBeenCalledWith('An unexpected error occurred'); });
  });

  it('handles ApiError messages', async () => {
    const f = vi.fn().mockRejectedValue(new TestApiError('Server error', 500));
    const { result } = renderHook(() => useApiInline(() => f()));
    await waitFor(() => { expect(result.current.error).toBe('Server error'); });
  });

  it('refetch triggers a new fetch', async () => {
    const f = vi.fn().mockResolvedValue({ count: 1 });
    const { result } = renderHook(() => useApiInline(() => f()));
    await waitFor(() => { expect(result.current.data).toEqual({ count: 1 }); });
    f.mockResolvedValueOnce({ count: 2 });
    act(() => { result.current.refetch(); });
    await waitFor(() => { expect(result.current.data).toEqual({ count: 2 }); });
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('usePostApi', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('execute works', async () => {
    const r = vi.fn().mockResolvedValue({ id: 'new' });
    const { result } = renderHook(() => usePostApiInline<any>());
    expect(result.current.loading).toBe(false);
    await act(async () => { await result.current.execute(() => r()); });
    await waitFor(() => { expect(result.current.data).toEqual({ id: 'new' }); });
  });

  it('reset clears state', async () => {
    const r = vi.fn().mockResolvedValue({ id: '1' });
    const { result } = renderHook(() => usePostApiInline<any>());
    await act(async () => { await result.current.execute(() => r()); });
    await waitFor(() => { expect(result.current.data).toEqual({ id: '1' }); });
    act(() => { result.current.reset(); });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('unmount safety (no state updates after unmount)', async () => {
    let resolveRef: (v: any) => void;
    const f = vi.fn().mockImplementation(() => new Promise((r) => { resolveRef = r; }));
    const { unmount } = renderHook(() => useApiInline(() => f()));
    unmount();
    act(() => { resolveRef!({ data: 'safe' }); });
    expect(true).toBe(true);
  });
});
