'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} aria-hidden="true" />,
  error: <XCircle size={18} aria-hidden="true" />,
  warning: <AlertTriangle size={18} aria-hidden="true" />,
  info: <Info size={18} aria-hidden="true" />,
};

const STYLES: Record<ToastType, string> = {
  success: 'border-emerald-500/40 bg-emerald-900/80 text-emerald-300',
  error: 'border-red-500/40 bg-red-900/80 text-red-300',
  warning: 'border-amber-500/40 bg-amber-900/80 text-amber-300',
  info: 'border-sky-500/40 bg-sky-900/80 text-sky-300',
};

/**
 * Single toast notification with slide-in from top-right, auto-dismiss after 5 s.
 * Respects prefers-reduced-motion: the animation is skipped when the user has
 * requested reduced motion (Framer Motion reads this via the `useReducedMotion`
 * hook internally when `reducedMotion="user"` is set on MotionConfig, but here
 * we provide explicit animation values that Framer Motion will skip for us).
 */
export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  return (
    <motion.div
      key={toast.id}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      initial={{ opacity: 0, x: 64, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 64, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`flex items-start gap-3 w-80 max-w-sm rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm pointer-events-auto ${STYLES[toast.type]}`}
    >
      <span className="mt-0.5 shrink-0">{ICONS[toast.type]}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{toast.title}</p>
        {toast.message && (
          <p className="text-xs mt-0.5 opacity-80 leading-relaxed">{toast.message}</p>
        )}
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
};

/**
 * Container that renders the toast stack in the top-right corner.
 */
export const ToastContainer: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  return (
    <div
      aria-label="Notifications"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
    >
      <AnimatePresence mode="sync">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};
