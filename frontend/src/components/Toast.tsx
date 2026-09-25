'use client';

/**
 * Toast.tsx — lightweight toast notifications for success and error states.
 * Used to show a Stellar explorer link after a successful deposit.
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, X, ExternalLink, AlertTriangle } from 'lucide-react';
import { explorerUrl } from '@/lib/vaultHelpers';

export type ToastVariant = 'success' | 'error';

export interface ToastData {
  id: string;
  variant: ToastVariant;
  title: string;
  message: string;
  txHash?: string;
  durationMs?: number;
}

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300); // wait for exit animation
    }, toast.durationMs ?? 6000);

    return () => {
      cancelAnimationFrame(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [toast.id, toast.durationMs, onDismiss]);

  const isSuccess = toast.variant === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 w-full max-w-sm rounded-2xl border p-4 shadow-xl transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      } ${
        isSuccess
          ? 'bg-slate-900 border-emerald-500/30'
          : 'bg-slate-900 border-red-500/30'
      }`}
    >
      {/* Icon */}
      <div
        className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
          isSuccess ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        }`}
      >
        {isSuccess ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${isSuccess ? 'text-emerald-400' : 'text-red-400'}`}>
          {toast.title}
        </p>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{toast.message}</p>
        {toast.txHash && (
          <a
            href={explorerUrl(toast.txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-1.5 text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
            aria-label="View transaction on Stellar Explorer"
          >
            <ExternalLink size={11} />
            View on Stellar Explorer
          </a>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 text-slate-500 hover:text-white transition-colors"
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = (toast: Omit<ToastData, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const success = (title: string, message: string, txHash?: string) =>
    addToast({ variant: 'success', title, message, txHash });

  const error = (title: string, message: string) =>
    addToast({ variant: 'error', title, message });

  return { toasts, dismiss, success, error };
}
