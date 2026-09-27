'use client';

import { useState, useEffect } from 'react';

interface WindowSize {
  width: number;
  height: number;
}

/**
 * Returns current window dimensions, updated on resize.
 * SSR-safe: returns {width: 0, height: 0} until hydration.
 */
export function useWindowSize(): WindowSize {
  const [size, setSize] = useState<WindowSize>({ width: 0, height: 0 });

  useEffect(() => {
    function update() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return size;
}

/** Returns true when the viewport is narrower than 768px (Tailwind `md` breakpoint). */
export function useIsMobile(): boolean {
  const { width } = useWindowSize();
  // 0 = SSR/initial state; treat as desktop to avoid layout shift
  return width > 0 && width < 768;
}
