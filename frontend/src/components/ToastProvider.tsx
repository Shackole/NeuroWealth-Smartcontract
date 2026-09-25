'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  /** Auto-dismiss delay in ms. Defaults to 5000. */
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  /** Convenience wrappers */
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Keep timers so we can cancel them when a toast is manually dismissed
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `toast-${++idCounter}`;
      const duration = toast.duration ?? 5_000;

      setToasts((prev) => [...prev, { ...toast, id }]);

      const timer = setTimeout(() => removeToast(id), duration);
      timers.current.set(id, timer);
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, duration?: number) => addToast({ type: 'success', message, duration }),
    [addToast]
  );
  const error = useCallback(
    (message: string, duration?: number) => addToast({ type: 'error', message, duration }),
    [addToast]
  );
  const warning = useCallback(
    (message: string, duration?: number) => addToast({ type: 'warning', message, duration }),
    [addToast]
  );
  const info = useCallback(
    (message: string, duration?: number) => addToast({ type: 'info', message, duration }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

// ─── Visual config per type ───────────────────────────────────────────────────

const TOAST_CONFIG: Record<
  ToastType,
  { icon: React.ElementType; containerClass: string; iconClass: string; label: string }
> = {
  success: {
    icon: CheckCircle2,
    containerClass:
      'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-100',
    iconClass: 'text-emerald-500',
    label: 'Success',
  },
  error: {
    icon: XCircle,
    containerClass:
      'bg-red-50 dark:bg-red-950/80 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-100',
    iconClass: 'text-red-500',
    label: 'Error',
  },
  warning: {
    icon: AlertTriangle,
    containerClass:
      'bg-yellow-50 dark:bg-yellow-950/80 border-yellow-200 dark:border-yellow-500/30 text-yellow-900 dark:text-yellow-100',
    iconClass: 'text-yellow-500',
    label: 'Warning',
  },
  info: {
    icon: Info,
    containerClass:
      'bg-blue-50 dark:bg-blue-950/80 border-blue-200 dark:border-blue-500/30 text-blue-900 dark:text-blue-100',
    iconClass: 'text-blue-500',
    label: 'Info',
  },
};

// ─── Individual toast item ────────────────────────────────────────────────────

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  const config = TOAST_CONFIG[toast.type];
  const Icon = config.icon;

  return (
    <div
      role="alert"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`flex items-start gap-3 w-full max-w-sm px-4 py-3.5 rounded-2xl border shadow-lg backdrop-blur-sm pointer-events-auto transition-all animate-in slide-in-from-right-4 fade-in duration-300 ${config.containerClass}`}
    >
      <Icon
        size={18}
        className={`mt-0.5 flex-shrink-0 ${config.iconClass}`}
        aria-hidden="true"
      />
      <span className="flex-1 text-sm font-medium leading-snug">{toast.message}</span>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        aria-label={`Dismiss ${config.label.toLowerCase()} notification`}
        className="flex-shrink-0 p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

function ToastContainer({
  toasts,
  onClose,
}: {
  toasts: Toast[];
  onClose: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}
