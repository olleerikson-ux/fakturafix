import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serverar appen under /fakturafix/. Lokalt körs den från roten.
  base: process.env.GITHUB_PAGES === 'true' ? '/fakturafix/' : '/',
  // Landningssidan ligger i roten och appen under /app/.
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
