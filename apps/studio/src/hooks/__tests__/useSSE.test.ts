import { renderHook, act } from '@testing-library/react';
import { useSSE } from '../useSSE';

// ─── Mock EventSource ─────────────────────────────────────────────────

const mockListeners: Record<string, ((...args: any[]) => void) | null> = {
  open: null,
  message: null,
  error: null,
};

const mockEventSource = {
  onopen: null as any,
  onmessage: null as any,
  onerror: null as any,
  close: vi.fn(),
  readyState: 0,
  addEventListener: vi.fn((event: string, handler: (...args: any[]) => void) => {
    mockListeners[event] = handler;
    if (event === 'open') mockEventSource.onopen = handler;
    if (event === 'message') mockEventSource.onmessage = handler;
    if (event === 'error') mockEventSource.onerror = handler;
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListeners.open = null;
  mockListeners.message = null;
  mockListeners.error = null;
  mockEventSource.onopen = null;
  mockEventSource.onmessage = null;
  mockEventSource.onerror = null;
});

vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));

// ─── Tests ────────────────────────────────────────────────────────────

describe('useSSE', () => {
  it('should return empty events initially', () => {
    const { result } = renderHook(() => useSSE(null));
    expect(result.current.events).toEqual([]);
  });

  it('should return disconnected status when url is null', () => {
    const { result } = renderHook(() => useSSE(null));
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('should not create EventSource when url is null', () => {
    renderHook(() => useSSE(null));
    expect(global.EventSource).not.toHaveBeenCalled();
  });

  it('should create EventSource when url is provided', () => {
    renderHook(() => useSSE('/api/stream/test-id'));
    expect(global.EventSource).toHaveBeenCalledWith('/api/stream/test-id');
  });

  it('should set connecting status on mount with url', () => {
    const { result } = renderHook(() => useSSE('/api/stream/test'));
    expect(result.current.connectionStatus).toBe('connecting');
  });

  it('should set connected status on open event', () => {
    const { result } = renderHook(() => useSSE('/api/stream/test'));

    act(() => {
      mockEventSource.onopen?.(new Event('open'));
    });

    expect(result.current.connectionStatus).toBe('connected');
  });

  it('should parse valid JSON messages', () => {
    const { result } = renderHook(() => useSSE('/api/stream/test'));

    act(() => {
      mockEventSource.onmessage?.({
        data: JSON.stringify({ type: 'progress', data: { percent: 50 } }),
      } as MessageEvent);
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].type).toBe('progress');
    expect(result.current.events[0].data).toEqual({ percent: 50 });
    expect(result.current.events[0].timestamp).toBeInstanceOf(Date);
  });

  it('should default to "message" type when type is missing', () => {
    const { result } = renderHook(() => useSSE('/api/stream/test'));

    act(() => {
      mockEventSource.onmessage?.({
        data: JSON.stringify({ data: 'hello' }),
      } as MessageEvent);
    });

    expect(result.current.events[0].type).toBe('message');
    expect(result.current.events[0].data).toBe('hello');
  });

  it('should handle invalid JSON gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSSE('/api/stream/test'));

    act(() => {
      mockEventSource.onmessage?.({ data: 'not-json' } as MessageEvent);
    });

    expect(result.current.events).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it('should set disconnected status on error', () => {
    const { result } = renderHook(() => useSSE('/api/stream/test'));

    act(() => {
      mockEventSource.onerror?.(new Event('error'));
    });

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it('should close EventSource on unmount', () => {
    const { unmount } = renderHook(() => useSSE('/api/stream/test'));
    unmount();
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it('should accumulate multiple messages', () => {
    const { result } = renderHook(() => useSSE('/api/stream/test'));

    act(() => {
      mockEventSource.onmessage?.({ data: JSON.stringify({ type: 'a', data: 1 }) } as MessageEvent);
    });
    act(() => {
      mockEventSource.onmessage?.({ data: JSON.stringify({ type: 'b', data: 2 }) } as MessageEvent);
    });
    act(() => {
      mockEventSource.onmessage?.({ data: JSON.stringify({ type: 'c', data: 3 }) } as MessageEvent);
    });

    expect(result.current.events).toHaveLength(3);
    expect(result.current.events[0].type).toBe('a');
    expect(result.current.events[1].type).toBe('b');
    expect(result.current.events[2].type).toBe('c');
  });

  it('should clear events via clearEvents', () => {
    const { result } = renderHook(() => useSSE('/api/stream/test'));

    act(() => {
      mockEventSource.onmessage?.({ data: JSON.stringify({ type: 'test' }) } as MessageEvent);
    });
    expect(result.current.events).toHaveLength(1);

    act(() => {
      result.current.clearEvents();
    });

    expect(result.current.events).toHaveLength(0);
  });

  it('should use entire data object when data field is missing', () => {
    const { result } = renderHook(() => useSSE('/api/stream/test'));

    act(() => {
      mockEventSource.onmessage?.({
        data: JSON.stringify({ foo: 'bar' }),
      } as MessageEvent);
    });

    expect(result.current.events[0].data).toEqual({ foo: 'bar' });
  });

  it('should handle nested data in data field', () => {
    const { result } = renderHook(() => useSSE('/api/stream/test'));

    act(() => {
      mockEventSource.onmessage?.({
        data: JSON.stringify({
          type: 'completed',
          data: { artifacts: { files: ['a.tsx', 'b.tsx'] }, deployUrl: 'https://example.com' },
        }),
      } as MessageEvent);
    });

    expect(result.current.events[0].type).toBe('completed');
    expect(result.current.events[0].data.artifacts.files).toEqual(['a.tsx', 'b.tsx']);
  });
});
