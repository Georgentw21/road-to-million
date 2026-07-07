// Service worker — network-first with a cache fallback (partial offline).
// IMPORTANT: only fall back to the cached app shell ("/") for NAVIGATION requests.
// For hashed JS/CSS assets we must NEVER return index.html as a fallback — the browser
// would try to execute HTML as a module and the whole app goes blank. Miss = real error.
const CACHE = 'rtm-cache-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch Supabase / Yahoo
  // Hashed build assets are immutable: cache-first is safe and fast; a miss just errors (never HTML).
  const isAsset = url.pathname.startsWith('/assets/');
  if (isAsset) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }
  // Everything else (navigations, sw, manifest…): network-first.
  const isNav = req.mode === 'navigate';
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (isNav ? caches.match('/') : Response.error())))
  );
});
