/* DeepWork Service Worker — Cache-first offline strategy */
/*
 * Every URL here is relative to *this file*, which is the one thing that makes
 * the app work in both places it is served from: a domain root (the desktop
 * webview, `ng serve`) and a sub-path (GitHub Pages serves the web build from
 * `/deepwork/`). Root-absolute paths are what broke it on the deployed site:
 * `/manifest.webmanifest` there is a 404 on somebody else's site, `addAll()`
 * rejects when any request fails, and a service worker that never finishes
 * installing is one of the reasons Chrome and Edge offered no install icon.
 */
const CACHE = 'deepwork-v2';

/* Where this worker is served from — `/deepwork/` or `/`. */
const SHELL = new URL('./', self.location.href).href;

/* ── Install: pre-cache app shell ── */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([SHELL, new URL('manifest.webmanifest', SHELL).href]))
      .then(() => self.skipWaiting()),
  );
});

/* ── Activate: purge old caches ── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* ── Fetch: serve from cache, fall back to network and cache response ── */
self.addEventListener('fetch', (e) => {
  const { request } = e;

  /* Only handle GET over http(s) */
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  /* Navigation requests (HTML pages): network-first, fallback to cached shell */
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(SHELL).then((cached) => cached ?? Response.error())),
    );
    return;
  }

  /* Static assets (JS, CSS, images, fonts): cache-first */
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      });
    }),
  );
});
