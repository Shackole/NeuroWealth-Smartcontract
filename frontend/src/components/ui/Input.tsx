'use client';

import React from 'react';
import { clsx } from 'clsx';

/**
 * Input — NeuroWealth Design System primitive
 *
 * Text input field with built-in label, helper text, error state, and icon support.
 *
 * ## Accessibility
 * - Label is always rendered and associated via `htmlFor` / `id`.
 * - Error message linked via `aria-describedby`.
 * - Required state uses `aria-required` + visible asterisk.
 * - Focus ring meets WCAG 2.4.11 (3:1 contrast on focus indicator).
 *
 * @example
 * ```tsx
 * <Input
 *   id="amount"
 *   label="Amount (USDC)"
 *   placeholder="10.00"
 *   type="number"
 *   leftAddon="$"
 *   error="Amount must be greater than 0"
 * />
 * ```
 */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Visible field label — always rendered (never hidden) */
  label: string;
  /** Helper text shown below the input */
  helperText?: string;
  /** Error message — shown in red when set, replaces helperText */
  error?: string;
  /** Icon or text rendered on the left inside the input border */
  leftAddon?: React.ReactNode;
  /** Icon or text rendered on the right inside the input border */
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      id,
      label,
      helperText,
      error,
      leftAddon,
      rightAddon,
      className,
      required,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const inputId      = id ?? `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const descId       = `${inputId}-desc`;
    const hasError     = Boolean(error);
    const hasHelper    = Boolean(helperText) || hasError;

    return (
      <div className={clsx('flex flex-col gap-1', className)}>
        {/* Label */}
        <label
          htmlFor={inputId}
          className="text-label text-neutral-700 dark:text-neutral-300 tracking-wide"
        >
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-error-500">*</span>
          )}
        </label>

        {/* Input wrapper */}
        <div className="relative flex items-center">
          {/* Left addon */}
          {leftAddon && (
            <span className={clsx(
              'pointer-events-none absolute left-3.5 select-none',
              'text-body-sm text-neutral-500 dark:text-neutral-400',
            )}>
              {leftAddon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-required={required}
            aria-describedby={hasHelper ? descId : undefined}
            aria-invalid={hasError}
            disabled={disabled}
            className={clsx(
              'w-full rounded-xl border bg-surface dark:bg-card-dark',
              'text-body text-neutral-900 dark:text-neutral-100',
              'placeholder:text-neutral-400 dark:placeholder:text-neutral-600',
              'py-3 px-4',
              'transition-all duration-200',
              // Focus ring
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              // Normal border
              !hasError && [
                'border-border dark:border-border-dark',
                'focus-visible:border-primary-500 focus-visible:ring-primary-500/30',
              ],
              // Error border
              hasError && [
                'border-error-500 dark:border-error-600',
                'focus-visible:ring-error-500/30',
              ],
              // Addons padding
              leftAddon  && 'pl-9',
              rightAddon && 'pr-9',
              // Disabled
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            {...rest}
          />

          {/* Right addon */}
          {rightAddon && (
            <span className={clsx(
              'pointer-events-none absolute right-3.5 select-none',
              'text-body-sm text-neutral-500 dark:text-neutral-400',
            )}>
              {rightAddon}
            </span>
          )}
        </div>

        {/* Helper / error text */}
        {hasHelper && (
          <p
            id={descId}
            className={clsx(
              'text-caption',
              hasError
                ? 'text-error-600 dark:text-error-400'
                : 'text-neutral-500 dark:text-neutral-400',
            )}
          >
            {hasError ? error : helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export default Input;
