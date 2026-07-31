const CACHE_NAME = 'i11-laundry-v3';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for EVERYTHING (API and static files alike): always try to fetch
// the latest version first, and only fall back to the last cached copy if the
// network request fails (e.g. offline). This means any edit you make to app.js,
// style.css, etc. shows up on next reload instead of getting stuck behind an
// old cached copy — which is what caused the "still shows old app.js" issue.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return; // never cache POST (booking actions)
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
