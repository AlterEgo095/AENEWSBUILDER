import React, { useState, useCallback, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
  createdAt: number;
}

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-emerald-400" />,
  error: <XCircle size={18} className="text-red-400" />,
  warning: <AlertTriangle size={18} className="text-amber-400" />,
  info: <Info size={18} className="text-blue-400" />,
};

const borderColors: Record<ToastType, string> = {
  success: 'border-l-emerald-500',
  error: 'border-l-red-500',
  warning: 'border-l-amber-500',
  info: 'border-l-blue-500',
};

const DEFAULT_DURATION = 4000;

// ─── Toast Store ──────────────────────────────────────
const listeners = new Set<() => void>();
let toasts: Toast[] = [];
let nextId = 0;

function emitChange() {
  listeners.forEach(fn => fn());
}

function addToast(type: ToastType, title: string, message?: string, duration = DEFAULT_DURATION) {
  const toast: Toast = {
    id: String(++nextId),
    type,
    title,
    message,
    duration,
    createdAt: Date.now(),
  };
  toasts = [...toasts, toast];
  emitChange();
  if (duration > 0) {
    setTimeout(() => removeToast(toast.id), duration);
  }
  return toast.id;
}

function removeToast(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  emitChange();
}

function clearAll() {
  toasts = [];
  emitChange();
}

// ─── Hook ─────────────────────────────────────────────
export function useToast() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const fn = () => forceUpdate(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  return {
    toasts: [...toasts],
    success: (title: string, message?: string, duration?: number) =>
      addToast('success', title, message, duration),
    error: (title: string, message?: string, duration?: number) =>
      addToast('error', title, message, duration),
    warning: (title: string, message?: string, duration?: number) =>
      addToast('warning', title, message, duration),
    info: (title: string, message?: string, duration?: number) =>
      addToast('info', title, message, duration),
    dismiss: removeToast,
    clear: clearAll,
  };
}

// ─── Toast Item ───────────────────────────────────────
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [progress, setProgress] = useState(100);
  const startTime = useRef(toast.createdAt);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    startTime.current = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime.current;
      const pct = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(pct);
      if (pct > 0) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [toast.duration, toast.createdAt]);

  return (
    <div
      className={clsx(
        'relative glass rounded-lg border-l-2 p-4 pr-10 animate-slide-up min-w-[320px] max-w-[420px] shadow-glass',
        borderColors[toast.type],
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{iconMap[toast.type]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200">{toast.title}</p>
          {toast.message && (
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{toast.message}</p>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/[0.03] rounded-b-lg overflow-hidden">
        <div
          className="h-full bg-white/20 transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ─── Container ────────────────────────────────────────
export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
