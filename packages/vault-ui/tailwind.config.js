/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'vault-canvas': 'var(--vault-canvas, #f9fafb)',
        'vault-surface': 'var(--vault-surface, #ffffff)',
        'vault-text': 'var(--vault-text, #111827)',
        'vault-muted': 'var(--vault-muted, #374151)',
        'vault-subtle': 'var(--vault-subtle, #4b5563)',
        'vault-border': 'var(--vault-border, #e5e7eb)',
        'vault-control-border': 'var(--vault-control-border, #d1d5db)',
        'vault-accent': 'var(--vault-accent, #1d4ed8)',
        'vault-accent-hover': 'var(--vault-accent-hover, #1e40af)',
        'vault-accent-soft': 'var(--vault-accent-soft, #dbeafe)',
        'vault-on-accent': 'var(--vault-on-accent, #ffffff)',
        'vault-success': 'var(--vault-success, #166534)',
        'vault-success-text': 'var(--vault-success-text, #14532d)',
        'vault-success-surface': 'var(--vault-success-surface, #f0fdf4)',
        'vault-success-border': 'var(--vault-success-border, #bbf7d0)',
        'vault-warning': 'var(--vault-warning, #713f12)',
        'vault-warning-surface': 'var(--vault-warning-surface, #fefce8)',
        'vault-warning-border': 'var(--vault-warning-border, #fef08a)',
        'vault-danger': 'var(--vault-danger, #991b1b)',
        'vault-danger-surface': 'var(--vault-danger-surface, #fef2f2)',
        'vault-danger-border': 'var(--vault-danger-border, #fecaca)',
      }
    },
  },
  plugins: [],
}
