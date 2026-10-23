'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible label for the dialog */
  ariaLabel?: string;
}

/**
 * Mobile bottom sheet with:
 *  - Slide-up 300 ms spring animation on open/close
 *  - Drag-to-dismiss via touch gesture
 *  - Focus trap inside the sheet
 *  - ESC key to close
 *  - safe-area-inset-bottom respected via padding
 *  - role="dialog" + aria-modal="true"
 */
export function BottomSheet({ isOpen, onClose, children, ariaLabel = 'Action sheet' }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);
  const [translateY, setTranslateY] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);

  // Mount → animate in
  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      // Next frame: start slide-up
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else if (rendered) {
      // Slide down then unmount
      setVisible(false);
      const t = setTimeout(() => setRendered(false), 320);
      return () => clearTimeout(t);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !sheetRef.current) return;
    const sheet = sheetRef.current;
    const focusable = sheet.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const prevFocus = document.activeElement as HTMLElement | null;
    first?.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (focusable.length === 0) { e.preventDefault(); return; }
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      prevFocus?.focus();
    };
  }, [isOpen]);

  // Prevent body scroll while sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Drag handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragCurrentY.current = 0;
    setAnimating(false);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta < 0) return; // Only allow dragging down
    dragCurrentY.current = delta;
    setTranslateY(delta);
  }, []);

  const onTouchEnd = useCallback(() => {
    setAnimating(true);
    const threshold = 120; // px
    if (dragCurrentY.current > threshold) {
      // Dismiss: slide to bottom
      setTranslateY(window.innerHeight);
      setTimeout(() => {
        setTranslateY(0);
        setAnimating(false);
        onClose();
      }, 300);
    } else {
      // Snap back
      setTranslateY(0);
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
  }, [onClose]);

  if (!rendered) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-slate-700 shadow-2xl
          bg-[#0d1117]
          transition-transform ${animating ? 'duration-300' : 'duration-[0ms]'}
          ease-[cubic-bezier(0.32,0.72,0,1)]`}
        style={{
          transform: visible
            ? `translateY(${translateY}px)`
            : `translateY(100%)`,
          // Respect device notch / home indicator
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
          maxHeight: '92dvh',
          overflowY: 'auto',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="w-10 h-1.5 rounded-full bg-slate-600"
            aria-hidden="true"
          />
        </div>

        <div className="px-4 pb-4 pt-2">
          {children}
        </div>
      </div>
    </>
  );
}
