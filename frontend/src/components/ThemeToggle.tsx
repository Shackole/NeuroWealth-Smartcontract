'use client';

import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type Theme } from './ThemeProvider';

interface ThemeOption {
  value: Theme;
  icon: React.ElementType;
  label: string;
  ariaLabel: string;
}

const OPTIONS: ThemeOption[] = [
  { value: 'light', icon: Sun, label: 'Light', ariaLabel: 'Switch to light mode' },
  { value: 'dark', icon: Moon, label: 'Dark', ariaLabel: 'Switch to dark mode' },
  { value: 'system', icon: Monitor, label: 'System', ariaLabel: 'Use system colour scheme preference' },
];

/**
 * ThemeToggle — three-way Light / Dark / System toggle.
 *
 * Accessible: each button has a descriptive aria-label and title.
 * Contrast: active button uses emerald highlight visible in both themes.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Colour scheme"
      className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
    >
      {OPTIONS.map(({ value, icon: Icon, label, ariaLabel }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={ariaLabel}
          aria-pressed={theme === value}
          title={label}
          className={`p-2 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${
            theme === value
              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/5'
          }`}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
