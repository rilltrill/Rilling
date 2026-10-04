/* OVERRUN service worker.
 *
 * This file is a TEMPLATE: vite.config.ts (pwaPlugin) fills in the version and
 * the list of built files and emits it as dist/sw.js. It never runs in dev.
 *
 *   index.html / navigations  network-first (3.5 s timeout) → cached shell offline
 *   assets/* (content-hashed) cache-first
 *   everything else           stale-while-revalidate
 *
 * Caches are named overrun-<version>; older ones are deleted on activate.
 */
const VERSION = '__OVERRUN_VERSION__';
const PRECACHE = __OVERRUN_PRECACHE__;
const CACHE = 'overrun-' + VERSION;
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL('./index.html', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(new URL(u, SCOPE).href, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('overrun-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const rel = url.pathname.slice(SCOPE.pathname.length);
  if (req.mode === 'navigate' || rel === '' || rel === 'index.html') {
    event.respondWith(networkFirst(req));
  } else if (rel.startsWith('assets/')) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req, event));
  }
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    // Redirected responses can't be replayed for navigations in Safari.
    if (res.ok && res.type === 'basic' && !res.redirected) cache.put(INDEX, res.clone());
    return res;
  });
  try {
    return await Promise.race([network, timeout(3500)]);
  } catch {
    const hit = await cache.match(INDEX);
    return hit || network;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req)
    .then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  return (await network) || Response.error();
}
