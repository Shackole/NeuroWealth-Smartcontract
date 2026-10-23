'use client';

import React from 'react';
import { clsx } from 'clsx';

/**
 * Badge — NeuroWealth Design System primitive
 *
 * Small inline label for status, strategy, protocol, and category indicators.
 *
 * ## Variants
 * - `success`   : Green — positive state, conservative strategy
 * - `warning`   : Amber — cautionary state, balanced strategy
 * - `error`     : Red — error or high-risk state
 * - `info`      : Sky — informational
 * - `primary`   : Emerald — brand-coloured
 * - `secondary` : Indigo — secondary accent
 * - `neutral`   : Slate — neutral/inactive
 *
 * ## Accessibility
 * - Uses `role="status"` when the badge contains live data (e.g., APY).
 * - Colour is never the sole indicator — uses both fill + border for contrast.
 * - All colour combinations meet WCAG AA 4.5:1.
 *
 * @example
 * ```tsx
 * <Badge variant="success">Conservative</Badge>
 * <Badge variant="warning" dot>Balanced</Badge>
 * <Badge variant="error">Paused</Badge>
 * ```
 */

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'primary'
  | 'secondary'
  | 'neutral';

export interface BadgeProps {
  /** Colour variant */
  variant?: BadgeVariant;
  /** Shows a small coloured dot before the label */
  dot?: boolean;
  /** ARIA live region role for dynamically updated badges */
  live?: boolean;
  className?: string;
  children: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  success:   'bg-success-50  text-success-700  border-success-200  dark:bg-success-950  dark:text-success-300  dark:border-success-800',
  warning:   'bg-warning-50  text-warning-700  border-warning-200  dark:bg-warning-950  dark:text-warning-300  dark:border-warning-800',
  error:     'bg-error-50    text-error-700    border-error-200    dark:bg-error-950    dark:text-error-300    dark:border-error-800',
  info:      'bg-accent-50   text-accent-700   border-accent-200   dark:bg-accent-950   dark:text-accent-300   dark:border-accent-800',
  primary:   'bg-primary-50  text-primary-700  border-primary-200  dark:bg-primary-950  dark:text-primary-300  dark:border-primary-800',
  secondary: 'bg-secondary-50 text-secondary-700 border-secondary-200 dark:bg-secondary-950 dark:text-secondary-300 dark:border-secondary-800',
  neutral:   'bg-neutral-100 text-neutral-600  border-neutral-200  dark:bg-neutral-800  dark:text-neutral-400  dark:border-neutral-700',
};

const dotColors: Record<BadgeVariant, string> = {
  success:   'bg-success-500',
  warning:   'bg-warning-500',
  error:     'bg-error-500',
  info:      'bg-accent-500',
  primary:   'bg-primary-500',
  secondary: 'bg-secondary-500',
  neutral:   'bg-neutral-400',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  dot     = false,
  live    = false,
  className,
  children,
}) => {
  return (
    <span
      role={live ? 'status' : undefined}
      className={clsx(
        'inline-flex items-center gap-1.5',
        'text-xs font-semibold',
        'px-2.5 py-0.5 rounded-full border',
        variantClasses[variant],
        className,
      )}
    >
      {dot && (
        <span
          className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};

Badge.displayName = 'Badge';

export default Badge;
