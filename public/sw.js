// Panzehir Kasa service worker.
//
// Goal: open instantly even when the host (*.vercel.app) is slow or blocked by the ISP. Pages and
// code come from the local cache; data never touches this worker (Firestore/Firebase Auth are on
// googleapis.com, which is cross-origin and passed through untouched).
//
// - /_next/static/* and icons: cache-first (file names are content-hashed, so they never change).
// - Pages and RSC payloads: network-first with a short timeout. A healthy connection always gets the
//   current deploy (no old page asking for chunks a new deploy no longer has); a reset or stalled
//   connection falls back to the cached copy within NETWORK_TIMEOUT_MS.

const CACHE = "kasa-v1";
const START_URL = "/kasa";
const NETWORK_TIMEOUT_MS = 2500;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(START_URL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || /\.(png|ico|svg|woff2?)$/.test(url.pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(event, request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  const network = fetch(request)
    .then((res) => {
      if (res.ok && !res.redirected) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  // Let a slow response still land in the cache after we have answered from it.
  event.waitUntil(network);

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  const res = await Promise.race([network, timeout]);
  if (res) return res;

  // ?_rsc= already makes RSC cache keys distinct, so Vary headers can be ignored.
  const hit =
    (await cache.match(request, { ignoreVary: true })) ||
    (fallbackUrl && (await cache.match(fallbackUrl)));
  if (hit) return hit;
  // Nothing cached yet (first visit): keep waiting for the network.
  return (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(event, request, START_URL));
  } else if (url.searchParams.has("_rsc") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(networkFirst(event, request, null));
  }
});
