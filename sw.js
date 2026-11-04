/* AirWise Pro service worker
   - Caches the app so it opens offline and installs as an app
   - Keeps the last air quality / weather responses for offline use
   - Shows notifications and focuses the app when one is clicked */

const VERSION = "v3";
const SHELL_CACHE = `airwise-shell-${VERSION}`;
const DATA_CACHE = `airwise-data-${VERSION}`;

const SHELL_FILES = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "favorites.js",
  "alerts.js",
  "personal.js",
  "tour.js",
  "prefs.js",
  "pwa.js",
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
    // CDN files are nice to have offline; don't fail install if one is down
    await Promise.all(CDN_FILES.map(url => cache.add(url).catch(() => {})));
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

  // Air quality & weather: network first, fall back to the last saved copy
  if (DATA_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // App files and CDN libraries: serve cached copy fast, update in the background
  if (url.origin === self.location.origin || CDN_FILES.includes(req.url) || url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "cdnjs.cloudflare.com") {
    event.respondWith(staleWhileRevalidate(req, url.origin === self.location.origin && req.mode === "navigate"));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req, { ignoreSearch: false });
    if (cached) return cached;
    // Different coordinates than last time: use the closest saved response for that API
    const all = await cache.keys();
    const sameApi = all.reverse().find(r => new URL(r.url).hostname === new URL(req.url).hostname && new URL(r.url).pathname === new URL(req.url).pathname);
    if (sameApi) return cache.match(sameApi);
    throw e;
  }
}

async function staleWhileRevalidate(req, isNavigation) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req, { ignoreSearch: isNavigation }) || (isNavigation ? await cache.match("index.html") : null);
  const network = fetch(req).then(res => {
    if (res && (res.ok || res.type === "opaque")) cache.put(isNavigation ? "index.html" : req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || new Response("Offline", { status: 503, statusText: "Offline" });
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
