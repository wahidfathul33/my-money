/**
 * Service worker — docs/13-deployment-vercel.md §8, docs/16-decision-log.md
 * ADR-012. Scope is DELIBERATELY narrow:
 *   - App shell + static assets (`/_next/static/*`, icons): cache-first.
 *   - Everything else (pages, API GET reads): network-first, falling back
 *     to cache when the network fails.
 *   - Every non-GET request (Server Actions, API mutations) is left
 *     COMPLETELY untouched — this worker never intercepts, queues, or
 *     retries a write. ADR-012: "tulisan tertunda memerlukan resolusi
 *     konflik, dan konflik pada data finansial dapat menghasilkan angka
 *     yang salah atau transaksi ganda. Menolak menyimpan lebih jujur
 *     daripada berjanji tersimpan lalu gagal diam-diam." The UI layer
 *     (src/lib/pwa/network-status.ts + each save handler's own
 *     `navigator.onLine` check) is what blocks a submit before it ever
 *     reaches this worker — there is nothing here for a write to queue
 *     INTO even if a bug ever tried.
 *
 * Plain, unbundled JS — served as a static file (`/sw.js`), not built by
 * Next.js. Cache name carries a version so `activate` can delete every
 * PREVIOUS version's caches on update — "Versioning cache; hapus cache
 * lama saat aktivasi" (todo.md).
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `mymoney-shell-${CACHE_VERSION}`;
const DATA_CACHE = `mymoney-data-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([SHELL_CACHE, DATA_CACHE]);

const SHELL_ASSETS = ['/', '/manifest.webmanifest', '/icons/192.png', '/icons/512.png', '/icons/maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      // Best-effort: a single missing/failed asset (e.g. offline during
      // install itself) shouldn't block the worker from installing at all.
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CURRENT_CACHES.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept a mutation — see this file's header. GET only, below.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin requests (e.g. the Google avatar image) pass straight
  // through untouched — this worker only ever caches this app's own origin.
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
    return;
  }

  // Network-first for everything else (pages, API GET reads) — fresh data
  // whenever the network is up, falling back to whatever was last cached
  // when it isn't. Never a stale-first flash on a normal, online load.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
  );
});
