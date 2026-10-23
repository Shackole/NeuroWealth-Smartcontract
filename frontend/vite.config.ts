import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Split optional dashboard code (charts, heavy widgets) out of the
    // initial balance-view chunk so core balance rendering does not wait
    // for chart code to download and parse.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('recharts') ||
              id.includes('chart.js') ||
              id.includes('d3-') ||
              id.includes('victory')
            ) {
              return 'charts';
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'react-vendor';
            }
            return 'vendor';
          }
          if (
            id.includes('/src/components/') &&
            /(Chart|Graph|Analytics|History)/i.test(id)
          ) {
            return 'dashboard-optional';
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
