/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ── Brand colour palette ───────────────────────────────────────────────
      // primary: emerald (main brand / CTA)
      // secondary: indigo (accent on charts, highlights)
      // accent: sky (links, informational)
      // success: green
      // warning: amber
      // error: red
      // neutral: slate (text, backgrounds, borders)
      colors: {
        // Primary – emerald
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
        // Secondary – indigo
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
        // Accent – sky
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
        // Success – green
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
        // Warning – amber
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
        // Error – red
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
        // Neutral – slate (text, surfaces, borders)
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
        // Semantic surface/card/border/muted aliases (kept for backwards compat)
        brand: {
          50:  '#ecfdf5',
          500: '#10b981',
          600: '#059669',
          900: '#064e3b',
        },
        surface: {
          DEFAULT: '#ffffff',
          dark:    '#080b11',
        },
        card: {
          DEFAULT: '#f8fafc',
          dark:    '#121824',
        },
        border: {
          DEFAULT: '#e2e8f0',
          dark:    '#1e293b',
        },
        muted: {
          DEFAULT: '#64748b',
          dark:    '#94a3b8',
        },
      },

      // ── Typography scale ───────────────────────────────────────────────────
      // Font families
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      // Font sizes: heading (h1–h4), body, caption, mono-number
      fontSize: {
        // Display / Hero
        'display-2xl': ['4.5rem',  { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-xl':  ['3.75rem', { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-lg':  ['3rem',    { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '700' }],
        // Headings
        'h1': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '800' }], // 36px
        'h2': ['1.875rem',{ lineHeight: '1.25',letterSpacing: '-0.01em', fontWeight: '700' }], // 30px
        'h3': ['1.5rem',  { lineHeight: '1.3', letterSpacing: '0',       fontWeight: '600' }], // 24px
        'h4': ['1.25rem', { lineHeight: '1.4', letterSpacing: '0',       fontWeight: '600' }], // 20px
        // Body
        'body-lg':  ['1.125rem', { lineHeight: '1.75', fontWeight: '400' }], // 18px
        'body':     ['1rem',     { lineHeight: '1.75', fontWeight: '400' }], // 16px
        'body-sm':  ['0.875rem', { lineHeight: '1.6',  fontWeight: '400' }], // 14px
        // Caption / label
        'caption':  ['0.75rem',  { lineHeight: '1.5',  fontWeight: '400' }], // 12px
        'label':    ['0.75rem',  { lineHeight: '1',    letterSpacing: '0.05em', fontWeight: '600' }], // 12px uppercase
        // Monospace numbers (balances, amounts)
        'mono-xl':  ['2rem',     { lineHeight: '1',    fontWeight: '700', fontVariantNumeric: 'tabular-nums' }],
        'mono-lg':  ['1.5rem',   { lineHeight: '1',    fontWeight: '700', fontVariantNumeric: 'tabular-nums' }],
        'mono-md':  ['1.25rem',  { lineHeight: '1',    fontWeight: '600', fontVariantNumeric: 'tabular-nums' }],
        'mono-sm':  ['1rem',     { lineHeight: '1',    fontWeight: '500', fontVariantNumeric: 'tabular-nums' }],
        'mono-xs':  ['0.875rem', { lineHeight: '1',    fontWeight: '500', fontVariantNumeric: 'tabular-nums' }],
      },
      // Font weights
      fontWeight: {
        regular: '400',
        medium:  '500',
        semibold:'600',
        bold:    '700',
        extrabold:'800',
      },
      // Line heights
      lineHeight: {
        tight:   '1.2',
        snug:    '1.375',
        normal:  '1.5',
        relaxed: '1.625',
        loose:   '1.75',
      },
      // Letter spacing
      letterSpacing: {
        tighter: '-0.02em',
        tight:   '-0.01em',
        normal:  '0',
        wide:    '0.025em',
        wider:   '0.05em',
        widest:  '0.1em',
      },

      // ── Spacing scale ──────────────────────────────────────────────────────
      // Follows Tailwind 4-px base grid.  Custom named aliases for semantic use.
      spacing: {
        // Named tokens for semantic use (all multiples of 4 px)
        'px':   '1px',
        '0':    '0px',
        '0.5':  '2px',
        '1':    '4px',
        '1.5':  '6px',
        '2':    '8px',
        '2.5':  '10px',
        '3':    '12px',
        '3.5':  '14px',
        '4':    '16px',  // base unit
        '5':    '20px',
        '6':    '24px',
        '7':    '28px',
        '8':    '32px',
        '9':    '36px',
        '10':   '40px',
        '11':   '44px',
        '12':   '48px',
        '14':   '56px',
        '16':   '64px',
        '20':   '80px',
        '24':   '96px',
        '28':   '112px',
        '32':   '128px',
        '36':   '144px',
        '40':   '160px',
        '44':   '176px',
        '48':   '192px',
        '52':   '208px',
        '56':   '224px',
        '60':   '240px',
        '64':   '256px',
        '72':   '288px',
        '80':   '320px',
        '96':   '384px',
      },

      // ── Border radius ──────────────────────────────────────────────────────
      borderRadius: {
        none:  '0',
        sm:    '4px',
        DEFAULT:'6px',
        md:    '8px',
        lg:    '12px',
        xl:    '16px',
        '2xl': '20px',
        '3xl': '24px',
        full:  '9999px',
      },

      // ── Shadows / glow effects ─────────────────────────────────────────────
      boxShadow: {
        'xs':            '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'sm':            '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        'md':            '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        'lg':            '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
        'xl':            '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        '2xl':           '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'inner':         'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
        'none':          'none',
        // Brand glow shadows (for interactive elements)
        'glow-emerald':  '0 0 25px -5px rgba(16, 185, 129, 0.3)',
        'glow-indigo':   '0 0 25px -5px rgba(99, 102, 241, 0.3)',
        'glow-sky':      '0 0 25px -5px rgba(14, 165, 233, 0.3)',
        'glow-amber':    '0 0 25px -5px rgba(245, 158, 11, 0.3)',
        // Card-level glow for dark mode
        'card-glow':     '0 0 40px -8px rgba(16, 185, 129, 0.15)',
        'card-glow-alt': '0 0 40px -8px rgba(99, 102, 241, 0.15)',
      },

      // ── Background images ──────────────────────────────────────────────────
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glass-gradient':  'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)',
        // Brand gradients
        'gradient-primary':    'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'gradient-secondary':  'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        'gradient-hero':       'linear-gradient(135deg, #10b981 0%, #6366f1 100%)',
        'gradient-dark-surface':'linear-gradient(180deg, #0f172a 0%, #080b11 100%)',
      },

      // ── Transitions / animations ───────────────────────────────────────────
      transitionDuration: {
        fast:   '100ms',
        normal: '200ms',
        slow:   '300ms',
        slower: '500ms',
      },
      transitionTimingFunction: {
        'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-out':    'cubic-bezier(0, 0, 0.2, 1)',
        'ease-in':     'cubic-bezier(0.4, 0, 1, 1)',
        'bounce':      'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
      animation: {
        'fade-in':   'fadeIn 0.2s ease-out',
        'slide-up':  'slideUp 0.3s ease-out',
        'pulse-slow':'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },

      // ── Z-index scale ──────────────────────────────────────────────────────
      zIndex: {
        behind:  '-1',
        base:    '0',
        raised:  '10',
        dropdown:'20',
        sticky:  '30',
        overlay: '40',
        modal:   '50',
        toast:   '60',
        tooltip: '70',
      },
    },
  },
  plugins: [],
};
