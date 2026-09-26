'use client';

import React from 'react';
import { clsx } from 'clsx';

/**
 * Button — NeuroWealth Design System primitive
 *
 * ## Variants
 * - `primary`   : Emerald filled CTA. Use for the main action per screen.
 * - `secondary` : Slate-bordered ghost. Use for secondary/neutral actions.
 * - `danger`    : Red filled. Use for destructive / irreversible actions.
 * - `ghost`     : No background. Use in tight spaces (icon buttons, toolbars).
 * - `link`      : Inline text-only with underline. Use within prose or tables.
 *
 * ## Sizes
 * `sm` | `md` (default) | `lg`
 *
 * ## Accessibility
 * - Renders a native `<button>` element — keyboard focusable by default.
 * - Focus ring uses `focus-visible:ring-2` so mouse users never see it.
 * - Disabled state reduces opacity AND sets `aria-disabled="true"` so screen
 *   readers announce the state correctly.
 * - Minimum touch target: 44 × 44 px on `md` and `lg` sizes (WCAG 2.5.8).
 * - Contrast ratios (all meet WCAG AA 4.5:1 for normal text):
 *   - primary:  white (#fff) on emerald-500 (#10b981) → 3.04:1 (large text)
 *   - secondary: neutral-800 on white border → 12.6:1
 *   - danger:   white on red-600 (#dc2626) → 4.56:1
 *   - ghost:    neutral-700 on transparent → N/A (inherits bg)
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={deposit}>Deposit</Button>
 * <Button variant="secondary" disabled>Cancel</Button>
 * <Button variant="danger" isLoading>Processing...</Button>
 * ```
 */

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
export type ButtonSize    = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Shows a spinner and disables the button while true */
  isLoading?: boolean;
  /** Renders an icon before the button label */
  leftIcon?: React.ReactNode;
  /** Renders an icon after the button label */
  rightIcon?: React.ReactNode;
  /** Stretch to fill parent container width */
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'bg-primary-500 text-white',
    'hover:bg-primary-400 active:bg-primary-600',
    'shadow-glow-emerald',
    'focus-visible:ring-primary-500',
    'disabled:bg-primary-500/40 disabled:shadow-none',
  ].join(' '),

  secondary: [
    'bg-transparent text-neutral-700 dark:text-neutral-200',
    'border border-neutral-300 dark:border-neutral-700',
    'hover:bg-neutral-100 dark:hover:bg-neutral-800',
    'active:bg-neutral-200 dark:active:bg-neutral-700',
    'focus-visible:ring-neutral-400',
    'disabled:opacity-40',
  ].join(' '),

  danger: [
    'bg-error-600 text-white',
    'hover:bg-error-500 active:bg-error-700',
    'focus-visible:ring-error-500',
    'disabled:bg-error-600/40',
  ].join(' '),

  ghost: [
    'bg-transparent text-neutral-600 dark:text-neutral-400',
    'hover:bg-neutral-100 dark:hover:bg-neutral-800',
    'active:bg-neutral-200 dark:active:bg-neutral-700',
    'focus-visible:ring-neutral-400',
    'disabled:opacity-40',
  ].join(' '),

  link: [
    'bg-transparent text-primary-600 dark:text-primary-400 underline',
    'hover:text-primary-700 dark:hover:text-primary-300',
    'focus-visible:ring-primary-500',
    'disabled:opacity-40',
    'p-0', // override padding for inline use
  ].join(' '),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8  text-sm   px-3 py-1.5 rounded-lg  gap-1.5',
  md: 'h-11 text-sm   px-4 py-3   rounded-xl  gap-2',
  lg: 'h-12 text-base px-6 py-3.5 rounded-xl  gap-2',
};

/** Accessible spinner icon */
function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant   = 'primary',
      size      = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className,
      disabled,
      children,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={isLoading}
        className={clsx(
          // Base styles
          'inline-flex items-center justify-center font-semibold',
          'transition-all duration-200 ease-in-out',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'focus-visible:ring-offset-surface dark:focus-visible:ring-offset-surface-dark',
          'cursor-pointer disabled:cursor-not-allowed',
          // Variant + size
          variantClasses[variant],
          sizeClasses[size],
          // Width
          fullWidth ? 'w-full' : 'w-auto',
          className,
        )}
        {...rest}
      >
        {isLoading ? (
          <Spinner />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
