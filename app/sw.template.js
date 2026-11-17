/* Service worker för Fakturafix. Filen genereras vid bygget (se vite.config.ts): PRECACHE och VERSION fylls i där. */
const VERSION = '__VERSION__';
const CACHE = `fakturafix-${VERSION}`;
const PRECACHE = __PRECACHE__;
const APP_URL = '__APP_URL__';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('fakturafix-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ignoreVary: servrar som skickar Vary: Origin ger annars missar för cors-anrop från sidan (moduler och stilmallar).
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.match(APP_URL, { ignoreVary: true }).then((cached) => cached || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { ignoreVary: true }).then((cached) => cached || fetch(request)));
});
