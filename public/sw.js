// TrendingRepo service worker — AGN-903.
// Pre-caches the hot routes' shells so repeat visitors get instant first
// paint. Network-first for navigations (so updates land); cache-first for
// static brand assets.

const CACHE_VERSION = 'tr-v1-2026-05-05';
const HOT_ROUTES = ['/', '/githubrepo', '/signals'];
const STATIC_ASSETS = [
  '/brand/trendingrepo-mark.svg',
  '/manifest.json',
  '/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll([...HOT_ROUTES, ...STATIC_ASSETS]).catch(() => {
        // Best-effort — partial pre-cache is better than failing install.
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Static assets: cache-first
  if (
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/manifest.json' ||
    url.pathname.match(/\.(png|svg|ico|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
        return res;
      }))
    );
    return;
  }

  // Hot navigation routes: network-first with cache fallback
  if (req.mode === 'navigate' && HOT_ROUTES.includes(url.pathname)) {
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
});
