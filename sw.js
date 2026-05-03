/* hebing.org — Service Worker
 * Strategy:
 *   - HTML pages:        network-first (so updates propagate); fallback to cache when offline
 *   - Static assets:     cache-first (favicons, manifest, og-image, common.css, common.js,
 *                        and /vendor/* which is version-pinned and immutable)
 *   - Google Fonts CDN:  stale-while-revalidate (the only third-party origin we still load from)
 *   - Analytics / ads:   passthrough — DO NOT cache, DO NOT block (we let the browser handle them
 *                        directly so consent / blockers behave normally)
 *   - Non-GET / opaque:  pass through (don't cache POST, file-saver blob URLs, etc.)
 *
 * Versioning: VERSION is the build identifier. We bump the timestamp on every release so old
 * caches are evicted on activate. Format: hebing-vN-YYYY-MM-DD-HHMM.
 */
const VERSION = 'hebing-v3-2026-04-29-01';
const HTML_CACHE   = `${VERSION}-html`;
const STATIC_CACHE = `${VERSION}-static`;
const CDN_CACHE    = `${VERSION}-cdn`;

// Static assets that rarely change. Note: we deliberately exclude /sitemap.xml, /llms*.txt, and
// /robots.txt — those change with content and the network-first / cache-first fallthrough below
// handles them just fine without forcing a precache hit.
const STATIC_URLS = [
  '/',
  '/manifest.json',
  '/common.css',
  '/common.js',
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/android-chrome-192.png',
  '/android-chrome-512.png',
  '/og-image.png'
];

// Cross-origin hosts we cache stale-while-revalidate. After the /vendor/ migration we no longer
// load JS from third-party CDNs — only Google Fonts CSS / WOFF2 remains cross-origin.
const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => c.addAll(STATIC_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => !k.startsWith(VERSION))
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  // Allow pages to trigger an immediate update check
  if(event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;                       // skip POST etc.
  const url = new URL(req.url);

  // Analytics / ads: passthrough (do NOT intercept — let the browser, consent system, and any
  // ad-blocker handle these directly). This is intentional.
  if(/googletagmanager|google-analytics|googlesyndication|doubleclick|googleadservices/.test(url.hostname)) return;

  // 1) HTML pages: network-first
  if(req.mode === 'navigate' || req.headers.get('Accept')?.includes('text/html')){
    event.respondWith(
      fetch(req)
        .then(res => {
          if(res.ok) caches.open(HTML_CACHE).then(c => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/') || caches.match('/404.html')))
    );
    return;
  }

  // 2) Cross-origin CDN: stale-while-revalidate
  if(url.origin !== self.location.origin){
    if(CDN_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))){
      event.respondWith(
        caches.match(req).then(cached => {
          const fresh = fetch(req).then(res => {
            if(res.ok) caches.open(CDN_CACHE).then(c => c.put(req, res.clone()));
            return res;
          }).catch(() => cached);
          return cached || fresh;
        })
      );
    }
    return; // other cross-origin: passthrough
  }

  // 3) Same-origin static assets: cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if(cached) return cached;
      return fetch(req).then(res => {
        if(res.ok && (res.type === 'basic' || res.type === 'default')){
          caches.open(STATIC_CACHE).then(c => c.put(req, res.clone()));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
