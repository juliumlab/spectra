/* Spectra service worker.
   Makes the app "always available": after the first online visit, the page,
   icons, and the people-blur model are cached, so everything works offline.

   Two cache buckets:
   - APP_CACHE: our own files (the app shell). Bump APP_VERSION to ship updates.
   - RUNTIME_CACHE: things fetched from other servers at run time — the
     TensorFlow.js scripts and the blur model weights (CDN + Google storage).
     These are cached the first time they load, then served from cache offline. */

const APP_VERSION = "spectra-v4";
const APP_CACHE = APP_VERSION + "-app";
const RUNTIME_CACHE = APP_VERSION + "-runtime";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== APP_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Page loads: try the network first so updates land when online, fall back
  // to the cached page when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Our own files: cache-first (they rarely change within a version).
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetchAndCache(req, APP_CACHE))
    );
    return;
  }

  // Cross-origin (TF.js scripts + model weights): cache-first, and store
  // whatever we get — including opaque responses — so blur works offline next
  // time. The very first load still needs a network connection.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetchAndCache(req, RUNTIME_CACHE))
  );
});

function fetchAndCache(req, cacheName) {
  return fetch(req).then((res) => {
    // Cache successful and opaque (no-cors) responses; skip error responses.
    if (res && (res.ok || res.type === "opaque")) {
      const copy = res.clone();
      caches.open(cacheName).then((cache) => cache.put(req, copy));
    }
    return res;
  });
}
