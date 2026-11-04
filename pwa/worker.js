/* Generated production inputs; never registered by the Vite development server. */
const revision = __REVISION__;
const files = __FILES__;
const prefix = 'studioodle-offline-' + self.registration.scope;
const cacheName = prefix + revision;
const urls = files.map(file => new URL(file, self.location).href);
const allowed = new Set(urls);
const appEntry = new URL('./index.html', self.location).href;

self.addEventListener('install', event => {
  // A failed/partial download must never replace the working offline version.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      // Bound concurrency for phones and larger artwork collections.
      let index = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (index < urls.length) {
          const url = urls[index++];
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (!response.ok || response.type === 'opaque') throw Error('Offline download failed');
          await cache.put(url, response);
        }
      }));
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  // Default waiting lifecycle: existing sessions retain their complete old build.
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const key = event.request.mode === 'navigate' && url.pathname.startsWith(new URL('./', self.location).pathname)
    ? appEntry : url.href;
  if (!allowed.has(key)) return;
  event.respondWith((async () => (await (await caches.open(cacheName)).match(key)) || fetch(event.request))());
});
