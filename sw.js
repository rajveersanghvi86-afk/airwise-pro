/* AirWise Pro service worker
   - Caches the app so it opens offline and installs as an app
   - Keeps the last air quality / weather responses for offline use
   - Shows notifications and focuses the app when one is clicked */

const VERSION = "v5";
const SHELL_CACHE = `airwise-shell-${VERSION}`;
const DATA_CACHE = `airwise-data-${VERSION}`;

const SHELL_FILES = [
  "./",
  "index.html",
  "app.min.css",
  "app.min.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png"
];

const CDN_FILES = [
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
];

const DATA_HOSTS = ["air-quality-api.open-meteo.com", "api.open-meteo.com", "api.waqi.info"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES);
    // CDN libraries (chart, map) are cached the first time they're used,
    // not up front, so a first visit doesn't download what it may never need
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("airwise-") && k !== SHELL_CACHE && k !== DATA_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Air quality & weather: network first, fall back to the saved copy of the
  // exact same request (never another place's data)
  if (DATA_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // App files: network first so updates show up right away, cache when offline
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, SHELL_CACHE, req.mode === "navigate"));
    return;
  }

  // Versioned CDN libraries and fonts never change: cache first
  if (CDN_FILES.includes(req.url) || ["fonts.gstatic.com", "fonts.googleapis.com", "cdnjs.cloudflare.com"].includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req, cacheName, isNavigation = false) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(isNavigation ? "index.html" : req, res.clone());
    return res;
  } catch (e) {
    const cached = isNavigation
      ? (await cache.match("index.html")) || (await cache.match("./"))
      : await cache.match(req);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
  return res;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.registration.scope) && "focus" in client) return client.focus();
    }
    return self.clients.openWindow(url);
  })());
});
