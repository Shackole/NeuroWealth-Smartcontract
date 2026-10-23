'use client';

import React from 'react';
import { clsx } from 'clsx';

/**
 * Card — NeuroWealth Design System primitive
 *
 * Container for grouped content sections. Supports multiple visual styles
 * to handle the platform's glass-morphism dark aesthetic.
 *
 * ## Variants
 * - `default`    : Standard flat card with subtle border.
 * - `glass`      : Frosted-glass panel (for dark hero sections).
 * - `elevated`   : Drop-shadow card (for popovers / modals).
 * - `outlined`   : Border-only, no background (for table rows / list items).
 *
 * ## Padding
 * `none` | `sm` | `md` (default) | `lg`
 *
 * ## Accessibility
 * - Renders a `<section>` with an optional `aria-label` for landmark navigation.
 * - Use `as="article"` for self-contained content (blog posts, feed items).
 *
 * @example
 * ```tsx
 * <Card variant="glass" padding="lg" aria-label="Portfolio balance">
 *   <BalanceCard ... />
 * </Card>
 * ```
 */

export type CardVariant = 'default' | 'glass' | 'elevated' | 'outlined';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardAs      = 'div' | 'section' | 'article' | 'aside';

export interface CardProps {
  /** Visual style */
  variant?: CardVariant;
  /** Internal padding preset */
  padding?: CardPadding;
  /** HTML element to render as */
  as?: CardAs;
  /** Adds hover/active interactive styles */
  interactive?: boolean;
  /** Adds a glow border on hover (primary brand glow) */
  glowOnHover?: boolean;
  /** ARIA label for landmark navigation */
  'aria-label'?: string;
  className?: string;
  children: React.ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default: [
    'bg-card dark:bg-card-dark',
    'border border-border dark:border-border-dark',
    'rounded-2xl',
  ].join(' '),

  glass: [
    'bg-glass-gradient backdrop-blur-xl',
    'border border-white/10 dark:border-white/5',
    'rounded-2xl',
  ].join(' '),

  elevated: [
    'bg-surface dark:bg-card-dark',
    'border border-border dark:border-border-dark',
    'shadow-lg dark:shadow-2xl',
    'rounded-2xl',
  ].join(' '),

  outlined: [
    'bg-transparent',
    'border border-border dark:border-border-dark',
    'rounded-xl',
  ].join(' '),
};

const paddingClasses: Record<CardPadding, string> = {
  none: 'p-0',
  sm:   'p-3',
  md:   'p-6',
  lg:   'p-8',
};

export const Card: React.FC<CardProps> = ({
  variant      = 'default',
  padding      = 'md',
  as: Tag       = 'div',
  interactive  = false,
  glowOnHover  = false,
  className,
  children,
  ...rest
}) => {
  return (
    <Tag
      className={clsx(
        'relative overflow-hidden',
        variantClasses[variant],
        paddingClasses[padding],
        interactive && [
          'cursor-pointer select-none',
          'transition-all duration-200 ease-in-out',
          'hover:border-primary-500/40 dark:hover:border-primary-500/30',
          'active:scale-[0.99]',
        ],
        glowOnHover && [
          'transition-shadow duration-300',
          'hover:shadow-card-glow',
        ],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
};

Card.displayName = 'Card';

// ── Compound sub-components ──────────────────────────────────────────────────

export interface CardHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  description,
  action,
  className,
}) => (
  <div className={clsx('flex items-start justify-between gap-4 mb-4', className)}>
    <div>
      <h3 className="text-h4 font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h3>
      {description && (
        <p className="text-body-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
          {description}
        </p>
      )}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

CardHeader.displayName = 'CardHeader';

export const CardDivider: React.FC<{ className?: string }> = ({ className }) => (
  <hr className={clsx('border-border dark:border-border-dark my-4', className)} />
);

CardDivider.displayName = 'CardDivider';

export default Card;
