// MZA app shell. Private pages, API traffic and cross-origin requests stay network-only.
// Older MZA shell caches are retired only after the new worker activates.
const CACHE = 'mza-shell-v10';
const SHELL = [
  '/offline.html',
  '/manifest.json',
  '/assets/icons/icon-192.png?v=20261120c',
  '/assets/icons/icon-512.png?v=20261120c',
  '/assets/icons/icon-maskable-192.png?v=20261120c',
  '/assets/icons/icon-maskable-512.png?v=20261120c',
  '/assets/icons/apple-touch-icon-180.png?v=20261120c',
  '/assets/css/site-theme.css?v=20261120h',
  '/assets/css/account-menu.css?v=20261120h',
  '/assets/js/account-menu.js?v=20261120h',
  '/assets/js/auth-session.js?v=20261120h',
  '/assets/css/pwa-install-v2.css?v=20261122a',
  '/assets/js/pwa-install-v2.js?v=20261122a',
  '/assets/js/language-preference.js?v=20261120c',
  '/assets/js/site-language.js?v=20261128a',
  '/assets/js/api-base.js',
  '/assets/css/profile-completion.css?v=20261122c',
  '/assets/js/profile-completion.js?v=20261122c',
];
const SHELL_ASSETS = new Set(SHELL.filter(path => path.startsWith('/assets/')));

self.addEventListener('install', event => {
  // A new worker waits for the user to confirm the update in the page prompt.
  const requests = SHELL.map(path => new Request(new URL(path, self.location.origin), { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)));
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

  // The offline page and its versioned dependencies are the only fallbacks.
  // Live assets always use normal HTTP caching. No response from an arbitrary
  // asset URL, failed request or API request can enter the offline cache.
  if (SHELL_ASSETS.has(url.pathname + url.search)) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(request)) || Response.error();
    }));
  }
});
