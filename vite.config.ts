import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Skriver sw.js vid bygget: appens HTML, JS och CSS (med hash i namnet) förcachas så att
 * appen startar utan nätverk. Versionen är en hash av listan, så gamla cachar rensas vid ny version.
 */
function serviceWorkerPlugin(): Plugin {
  let base = '/';
  return {
    name: 'fakturafix-service-worker',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    // Efter Vites egen HTML-hantering, så att app/index.html finns i bygget med slutgiltiga sökvägar.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['app/index.html'];
      if (!html || html.type !== 'asset') throw new Error('app/index.html saknas i bygget');
      const referenced = [...String(html.source).matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1] ?? '')
        .filter((url) => url.startsWith(base) && !url.endsWith('/'));
      const appUrl = `${base}app/`;
      const precache = [...new Set([appUrl, ...referenced, `${base}manifest.webmanifest`])].sort();
      const template = readFileSync(resolve(__dirname, 'app/sw.template.js'), 'utf8');
      const version = createHash('sha1').update(JSON.stringify(precache)).update(template).digest('hex').slice(0, 12);
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache))
        .replace('__APP_URL__', appUrl);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [serviceWorkerPlugin()],
  // GitHub Pages serverar appen under /fakturafix/. Lokalt körs den från roten.
  base: process.env.GITHUB_PAGES === 'true' ? '/fakturafix/' : '/',
  // Landningssidan ligger i roten och appen under /app/.
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
        guider: resolve(__dirname, 'guider/index.html'),
        guideFaktura: resolve(__dirname, 'guider/skriva-faktura-enskild-firma/index.html'),
        guideOcr: resolve(__dirname, 'guider/ocr-nummer/index.html'),
        guideMoms: resolve(__dirname, 'guider/momssatser/index.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
