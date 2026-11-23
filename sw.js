// Service worker: network-first for app code/HTML so updates show up as soon
// as you're online; cache is used only as an offline fallback. Static assets
// (icons, manifest) stay cache-first.
const CACHE = "finance-tracker-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./i18n.js",
  "./store.js",
  "./projection.js",
  "./chart.js",
  "./raccoon.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Treat our own HTML/CSS/JS as "code" → network-first.
function isCode(url) {
  return /\.(html|css|js|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (isCode(url)) {
    // network-first: always try the network, update cache, fall back offline
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // everything else (icons, images): cache-first
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
