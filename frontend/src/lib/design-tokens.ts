/**
 * NeuroWealth Design Tokens
 *
 * Single source of truth for all design tokens used across the platform.
 * All values map 1:1 to the Tailwind config in tailwind.config.js.
 *
 * Usage:
 *   import { tokens } from '@/lib/design-tokens';
 *   tokens.color.primary[500] // '#10b981'
 *
 * @see frontend/tailwind.config.js
 * @see docs/DESIGN_SYSTEM.md
 */

// ── Colour palette ──────────────────────────────────────────────────────────

export const colors = {
  /** Primary – emerald green (CTA, success states, main brand identity) */
  primary: {
    50:  '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981', // brand default
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },
  /** Secondary – indigo (charts, highlights, secondary CTA) */
  secondary: {
    50:  '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
    950: '#1e1b4b',
  },
  /** Accent – sky (links, informational states) */
  accent: {
    50:  '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  },
  /** Success – green (positive yield, confirmations) */
  success: {
    50:  '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
    950: '#052e16',
  },
  /** Warning – amber (alerts, rate limits, cautions) */
  warning: {
    50:  '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
  },
  /** Error – red (validation errors, destructive actions) */
  error: {
    50:  '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a',
  },
  /** Neutral – slate (text, backgrounds, borders, dividers) */
  neutral: {
    50:  '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
} as const;

// ── Semantic colour aliases ──────────────────────────────────────────────────

export const semanticColors = {
  /** Light mode surface backgrounds */
  surface: {
    page:      '#ffffff',
    card:      '#f8fafc',
    overlay:   'rgba(255, 255, 255, 0.8)',
    glass:     'rgba(255, 255, 255, 0.05)',
  },
  /** Dark mode surface backgrounds */
  surfaceDark: {
    page:      '#080b11',
    card:      '#121824',
    overlay:   'rgba(0, 0, 0, 0.7)',
    glass:     'rgba(255, 255, 255, 0.03)',
  },
  /** Text colour hierarchy */
  text: {
    primary:   '#0f172a',  // neutral-900
    secondary: '#475569',  // neutral-600
    muted:     '#64748b',  // neutral-500
    disabled:  '#94a3b8',  // neutral-400
    inverse:   '#ffffff',
  },
  /** Dark mode text colour hierarchy */
  textDark: {
    primary:   '#f1f5f9',  // neutral-100
    secondary: '#94a3b8',  // neutral-400
    muted:     '#64748b',  // neutral-500
    disabled:  '#334155',  // neutral-700
    inverse:   '#0f172a',
  },
  /** Border colours */
  border: {
    DEFAULT: '#e2e8f0',   // neutral-200
    strong:  '#cbd5e1',   // neutral-300
    subtle:  '#f1f5f9',   // neutral-100
  },
  borderDark: {
    DEFAULT: '#1e293b',   // neutral-800
    strong:  '#334155',   // neutral-700
    subtle:  '#0f172a',   // neutral-900
  },
} as const;

// ── Typography scale ─────────────────────────────────────────────────────────

export const typography = {
  /** Font families */
  fontFamily: {
    sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
  },
  /**
   * Heading sizes h1–h4 with weight, line-height, and letter-spacing.
   * All sizes based on a modular scale with a 1.25 ratio (Major Third).
   */
  heading: {
    h1: { fontSize: '2.25rem',  lineHeight: '1.2',  fontWeight: '800', letterSpacing: '-0.01em' }, // 36px
    h2: { fontSize: '1.875rem', lineHeight: '1.25', fontWeight: '700', letterSpacing: '-0.01em' }, // 30px
    h3: { fontSize: '1.5rem',   lineHeight: '1.3',  fontWeight: '600', letterSpacing: '0'       }, // 24px
    h4: { fontSize: '1.25rem',  lineHeight: '1.4',  fontWeight: '600', letterSpacing: '0'       }, // 20px
  },
  /** Body text sizes */
  body: {
    lg:  { fontSize: '1.125rem', lineHeight: '1.75', fontWeight: '400' }, // 18px
    md:  { fontSize: '1rem',     lineHeight: '1.75', fontWeight: '400' }, // 16px
    sm:  { fontSize: '0.875rem', lineHeight: '1.6',  fontWeight: '400' }, // 14px
  },
  /** Caption and label sizes */
  caption: {
    caption: { fontSize: '0.75rem', lineHeight: '1.5', fontWeight: '400' }, // 12px
    label:   { fontSize: '0.75rem', lineHeight: '1',   fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase' }, // 12px
  },
  /**
   * Monospace numbers — for balances, amounts, percentages.
   * Uses tabular numerals for clean vertical alignment.
   */
  mono: {
    xl:  { fontSize: '2rem',     fontWeight: '700', fontFamily: 'mono' }, // 32px
    lg:  { fontSize: '1.5rem',   fontWeight: '700', fontFamily: 'mono' }, // 24px
    md:  { fontSize: '1.25rem',  fontWeight: '600', fontFamily: 'mono' }, // 20px
    sm:  { fontSize: '1rem',     fontWeight: '500', fontFamily: 'mono' }, // 16px
    xs:  { fontSize: '0.875rem', fontWeight: '500', fontFamily: 'mono' }, // 14px
  },
} as const;

// ── Spacing scale (4px base grid) ───────────────────────────────────────────

export const spacing = {
  /** Named spacing tokens mapped to the 4px grid */
  0:   '0px',
  1:   '4px',   // micro
  2:   '8px',   // xs
  3:   '12px',  // sm
  4:   '16px',  // md (base)
  5:   '20px',
  6:   '24px',  // lg
  8:   '32px',  // xl
  10:  '40px',
  12:  '48px',  // 2xl
  16:  '64px',  // 3xl
  20:  '80px',
  24:  '96px',  // 4xl
  32:  '128px',
} as const;

// ── Component spacing helpers ────────────────────────────────────────────────

export const componentSpacing = {
  /** Card internal padding */
  card: { xs: spacing[3], sm: spacing[4], md: spacing[6], lg: spacing[8] },
  /** Button padding (y, x) */
  button: {
    sm:  { y: spacing[2], x: spacing[3] },
    md:  { y: spacing[3], x: spacing[4] },
    lg:  { y: spacing[4], x: spacing[6] },
  },
  /** Form input padding */
  input: { y: spacing[3], x: spacing[4] },
  /** Modal internal padding */
  modal: spacing[6],
  /** Section spacing */
  section: { sm: spacing[8], md: spacing[12], lg: spacing[16] },
} as const;

// ── Border radius ────────────────────────────────────────────────────────────

export const borderRadius = {
  none:  '0',
  sm:    '4px',
  md:    '8px',
  lg:    '12px',
  xl:    '16px',
  '2xl': '20px',
  '3xl': '24px',
  full:  '9999px',
} as const;

// ── Shadows ──────────────────────────────────────────────────────────────────

export const shadows = {
  xs:           '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm:           '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md:           '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg:           '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl:           '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  glowEmerald:  '0 0 25px -5px rgba(16, 185, 129, 0.3)',
  glowIndigo:   '0 0 25px -5px rgba(99, 102, 241, 0.3)',
  glowSky:      '0 0 25px -5px rgba(14, 165, 233, 0.3)',
  cardGlow:     '0 0 40px -8px rgba(16, 185, 129, 0.15)',
} as const;

// ── Breakpoints ──────────────────────────────────────────────────────────────

export const breakpoints = {
  sm:  '640px',
  md:  '768px',
  lg:  '1024px',
  xl:  '1280px',
  '2xl':'1536px',
} as const;

// ── Z-index scale ────────────────────────────────────────────────────────────

export const zIndex = {
  behind:   -1,
  base:     0,
  raised:   10,
  dropdown: 20,
  sticky:   30,
  overlay:  40,
  modal:    50,
  toast:    60,
  tooltip:  70,
} as const;

// ── Aggregate export ─────────────────────────────────────────────────────────

export const tokens = {
  colors,
  semanticColors,
  typography,
  spacing,
  componentSpacing,
  borderRadius,
  shadows,
  breakpoints,
  zIndex,
} as const;

export type Tokens = typeof tokens;
export default tokens;
