// MZA app shell. Private pages, API traffic and cross-origin requests stay network-only.
// Cache name bumped from mza-shell-v5 to mza-shell-v6; older shell caches are retired on activate.
const CACHE = 'mza-shell-v6';
const SHELL = [
  '/offline.html',
  '/manifest.json',
  '/assets/icons/icon-192.png?v=20261120c',
  '/assets/icons/icon-512.png?v=20261120c',
  '/assets/icons/icon-maskable-192.png?v=20261120c',
  '/assets/icons/icon-maskable-512.png?v=20261120c',
  '/assets/icons/apple-touch-icon-180.png?v=20261120c',
  '/assets/css/site-theme.css?v=20261120e',
  '/assets/css/pwa-install.css?v=20261120f',
  '/assets/js/pwa-install.js?v=20261120f',
  '/assets/js/language-preference.js?v=20261120c',
  '/assets/js/site-language.js?v=20261120e',
  '/assets/js/api-base.js',
];

self.addEventListener('install', event => {
  // A new worker waits for the user to confirm the update in the page prompt.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('mza-shell-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  // Only an explicit user action may make the waiting worker take over.
  if (event.data && event.data.type === 'MZA_SKIP_WAITING') self.skipWaiting();
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
    // Stale-while-revalidate: serve the cached copy immediately and refresh it
    // in the background. The request URL (including its version query) stays intact.
    const cachePromise = caches.open(CACHE);
    const fresh = fetch(request).then(response => {
      const cacheControl = response.headers.get('cache-control') || '';
      if (response.ok && !cacheControl.includes('no-store')) {
        const copy = response.clone();
        return cachePromise.then(cache => cache.put(request, copy)).then(() => response, () => response);
      }
      return response;
    }).catch(() => null);
    event.waitUntil(fresh);
    event.respondWith(cachePromise
      .then(cache => cache.match(request))
      .then(cached => cached || fresh.then(response => response || Response.error())));
  }
});
