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
      colors: {
        brand: {
          50: '#f0fdf4',
          500: '#10b981',
          600: '#059669',
          900: '#064e3b',
        },
        surface: {
          DEFAULT: '#ffffff',
          dark: '#080b11',
        },
        card: {
          DEFAULT: '#f8fafc',
          dark: '#121824',
        },
        border: {
          DEFAULT: '#e2e8f0',
          dark: '#1e293b',
        },
        muted: {
          DEFAULT: '#64748b',
          dark: '#94a3b8',
        },
        /*
         * CVD-safe status colours (WCAG SC 1.4.1 compliant).
         * These pass both deuteranopia and protanopia simulations.
         * Each status is ALSO differentiated by shape/icon — colour is not
         * the sole carrier of meaning.
         *
         * Simulation tool: Color Oracle (free, cross-platform)
         * Reference: https://www.color-oracle.org/
         */
        cvd: {
          success: '#2563eb', // Blue  — ✓ check icon
          warning: '#d97706', // Amber — △ triangle icon
          error:   '#dc2626', // Red   — ✕ X icon (paired with icon)
          info:    '#0891b2', // Teal  — ℹ info icon
        },
        /*
         * Chart colour palette — blue/orange pairing avoids the red/green
         * confusion experienced by deuteranopes and protanopes.
         */
        chart: {
          a: '#2563eb', // Blue   — Portfolio Value series
          b: '#d97706', // Amber  — Accrued Yield series
          c: '#0891b2', // Teal   — reserved (third series)
          d: '#7c3aed', // Violet — reserved (fourth series)
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)',
      },
      boxShadow: {
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.3)',
        'glow-indigo': '0 0 25px -5px rgba(99, 102, 241, 0.3)',
        'glow-blue':   '0 0 25px -5px rgba(37, 99, 235, 0.3)',
      },
    },
  },
  plugins: [],
};
