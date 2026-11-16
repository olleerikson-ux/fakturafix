import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serverar appen under /fakturafix/. Lokalt körs den från roten.
  base: process.env.GITHUB_PAGES === 'true' ? '/fakturafix/' : '/',
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
