import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { useToast, ToastContainer } from '../Toast';

// ─── Helper to use hooks with render ──────────────────────────────────
function renderHook<T>(hook: () => T) {
  const results: { current: T } = { current: null as any };
  function TestComponent() {
    results.current = hook();
    return null;
  }
  const utils = render(<TestComponent />);
  return { result: results, ...utils };
}

// ─── Reset global state between tests ─────────────────────────────────
// The Toast module uses module-level state (toasts, listeners, nextId).
// We need to reset it between tests to avoid cross-contamination.

// Import the clear function indirectly via useToast
describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear global toast state by calling clear through a fresh hook
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.clear();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add success toast', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.success('Success title', 'Success message');
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe('success');
    expect(result.current.toasts[0].title).toBe('Success title');
    expect(result.current.toasts[0].message).toBe('Success message');
  });

  it('should add error toast', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.error('Error title');
    });
    expect(result.current.toasts[0].type).toBe('error');
    expect(result.current.toasts[0].title).toBe('Error title');
  });

  it('should add warning toast', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.warning('Warning title');
    });
    expect(result.current.toasts[0].type).toBe('warning');
  });

  it('should add info toast', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.info('Info title');
    });
    expect(result.current.toasts[0].type).toBe('info');
  });

  it('should dismiss specific toast', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      const id = result.current.success('Toast 1');
      result.current.success('Toast 2');
      result.current.dismiss(id);
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe('Toast 2');
  });

  it('should clear all toasts', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.success('T1');
      result.current.error('T2');
      result.current.info('T3');
    });
    expect(result.current.toasts).toHaveLength(3);

    act(() => {
      result.current.clear();
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('should auto-dismiss toast after duration', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.success('Auto dismiss', 'Will disappear', 1000);
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1001);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('should not auto-dismiss when duration is 0', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.success('Persistent', 'Stays forever', 0);
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.toasts).toHaveLength(1);
  });

  it('should accumulate multiple toasts within a single test', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.success('T1');
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.error('T2');
    });
    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      result.current.warning('T3');
    });
    expect(result.current.toasts).toHaveLength(3);

    act(() => {
      result.current.info('T4');
    });
    expect(result.current.toasts).toHaveLength(4);
  });

  it('should assign unique IDs to each toast', () => {
    const { result } = renderHook(() => useToast());
    const ids: string[] = [];
    act(() => {
      ids.push(result.current.success('T1'));
      ids.push(result.current.error('T2'));
      ids.push(result.current.warning('T3'));
    });
    expect(new Set(ids).size).toBe(3);
  });

  it('should generate incrementing numeric IDs', () => {
    const { result } = renderHook(() => useToast());
    let id1: string;
    act(() => {
      id1 = result.current.success('T1');
    });
    let id2: string;
    act(() => {
      id2 = result.current.success('T2');
    });
    expect(Number(id2)).toBeGreaterThan(Number(id1));
  });

  it('should include createdAt timestamp', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.success('Timed');
    });
    expect(result.current.toasts[0].createdAt).toBeTypeOf('number');
    expect(result.current.toasts[0].createdAt).toBeGreaterThan(0);
  });
});

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear global state
    const { result } = renderHook(() => useToast());
    act(() => { result.current.clear(); });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render toasts when they exist', () => {
    function TestComponent() {
      const toast = useToast();
      React.useEffect(() => {
        toast.success('Title', 'Message');
      }, []);
      return <ToastContainer />;
    }
    render(<TestComponent />);

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
  });

  it('should render correct icon/border for each type', () => {
    function TestComponent() {
      const toast = useToast();
      React.useEffect(() => {
        toast.success('Success');
        toast.error('Error');
        toast.warning('Warning');
        toast.info('Info');
      }, []);
      return <ToastContainer />;
    }
    const { container } = render(<TestComponent />);

    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();

    // Check border colors
    expect(container.querySelector('.border-l-emerald-500')).toBeInTheDocument();
    expect(container.querySelector('.border-l-red-500')).toBeInTheDocument();
    expect(container.querySelector('.border-l-amber-500')).toBeInTheDocument();
    expect(container.querySelector('.border-l-blue-500')).toBeInTheDocument();
  });
});
