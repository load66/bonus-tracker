// Bank Bonus Tracker Service Worker
// ✅ Version 3.4.04: staged updates, full app-shell caching, and safe cache cleanup.

const V = 'bt-v3.4.04';
const ASSETS = ['./app.js', './bank-rules-academy.js', './bank-rules-boa-business.js', './bank-rules-busey.js', './bank-rules-capitalone.js', './bank-rules-equity.js', './bank-rules-pnc.js', './bank-rules-regions.js', './bank-rules.js', './churn-profile-memory.js', './controller.js', './close-rules-core.js', './close-rules-integration.js', './close-rules.css', './engine.js', './icon.svg', './index.html', './learning-inbox-conflict.js', './manifest.json', './professional-upgrades.js', './profile-db.js', './profile-library-selftest-academy.js', './profile-library-selftest.js', './profile-registry-academy.js', './profile-registry.js', './source-resolver.js', './style.css', './sw.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(V).then(cache => cache.addAll(ASSETS)).catch(() => null)
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAppShellOrCode(url, req) {
  const path = url.pathname.toLowerCase();
  const accept = req.headers.get('accept') || '';
  return (
    req.mode === 'navigate' ||
    accept.includes('text/html') ||
    path.endsWith('/index.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.json')
  );
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return;

  // App code must be network-first so old helper scripts cannot keep rewriting the badge.
  if (isAppShellOrCode(url, req)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(V).then(cache => cache.put(req, copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Non-code assets can remain cache-first for speed/offline support.
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const copy = res.clone();
        caches.open(V).then(cache => cache.put(req, copy)).catch(() => null);
        return res;
      });
    })
  );
});
