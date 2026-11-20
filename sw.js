// MZA app shell. Private pages, API traffic and cross-origin requests stay network-only.
const CACHE = 'mza-shell-v3';
const SHELL = [
  '/offline.html',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-192.png',
  '/assets/icons/icon-maskable-512.png',
  '/assets/icons/apple-touch-icon-180.png',
  '/assets/css/site-theme.css?v=20261120b',
  '/assets/js/language-preference.js?v=20261120b',
  '/assets/js/site-language.js',
  '/assets/js/api-base.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('mza-shell-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match('/offline.html')) || Response.error();
    }));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      const cacheControl = response.headers.get('cache-control') || '';
      if (response.ok && !cacheControl.includes('no-store')) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    })));
  }
});
