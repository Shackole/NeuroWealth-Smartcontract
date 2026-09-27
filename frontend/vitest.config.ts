import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 80,
        functions: 80,
      },
      exclude: [
        // Build output
        '.next/**',
        'node_modules/**',
        // Generated / config files
        'src/app/globals.css',
        'postcss.config.js',
        'tailwind.config.js',
        'next.config.js',
        'vitest.config.ts',
        // Type definition files
        'src/**/*.d.ts',
        // Test files themselves
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        // i18n boilerplate
        'src/i18n/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
