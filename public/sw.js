const CACHE_NAME = 'gymlog-static-v3';
const ASSETS_TO_CACHE = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // The old worker may serve the first page's assets while this worker installs.
    // Cache the new shell and its hashed bundles before removing the old cache.
    const response = await fetch('/index.html', { cache: 'no-store' });
    if (!response.ok) throw new Error('App shell could not be cached');
    const html = await response.clone().text();
    const bundles = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map(match => new URL(match[1], self.location.origin))
      .filter(url => url.origin === self.location.origin && /^\/assets\/.+\.(js|css)$/.test(url.pathname))
      .map(url => url.href);
    if (!bundles.some(url => new URL(url).pathname.endsWith('.js'))) throw new Error('App bundle missing from shell');
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...ASSETS_TO_CACHE.filter(path => path !== '/' && path !== '/index.html'), ...new Set(bundles)]);
    await cache.put('/index.html', response.clone());
    await cache.put('/', response);
    // An incomplete download leaves the existing worker and its cache active.
    await self.skipWaiting();
  })());
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
