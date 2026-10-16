const CACHE_NAME = 'gymlog-static-v2';
const ASSETS_TO_CACHE = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)));
  // Remove private API responses left by the old worker as soon as this update activates.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('gymlog-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Auth, REST, RPC and every other remote request always go directly to the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;
  const isNavigation = request.mode === 'navigate';
  const isStatic = ASSETS_TO_CACHE.includes(url.pathname) || /^\/assets\/.+\.(js|css|woff2?|png|svg)$/.test(url.pathname);
  if (!isNavigation && !isStatic) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(isNavigation ? '/index.html' : request, response.clone());
      }
      return response;
    } catch {
      return await caches.match(isNavigation ? '/index.html' : request) || Response.error();
    }
  })());
});
