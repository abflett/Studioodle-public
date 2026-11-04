/* Generated production inputs; never registered by the Vite development server. */
const revision = __REVISION__;
const files = __FILES__;
const prefix = 'studioodle-offline-' + self.registration.scope;
const cacheName = prefix + revision;
const urls = files.map(file => new URL(file.url, self.location).href);
const allowed = new Set(urls);
const appEntry = new URL('./index.html', self.location).href;
const scope = new URL('./', self.location).href;
const assets = new URL('../assets/', self.location).href;
const clientsKey = new URL('./__offline_clients__', self.location).href;
let cleaning = Promise.resolve();

// Keep complete historical builds while their windows are still using them.
// Persist IDs so worker suspension/restart cannot forget an open drawing session.
function cleanOldCaches() {
  const task = cleaning.then(async () => {
    const cache = await caches.open(cacheName);
    const record = await cache.match(clientsKey);
    if (!record) return;
    const live = new Set((await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).map(client => client.id));
    const remaining = (await record.json()).filter(id => live.has(id));
    await cache.put(clientsKey, new Response(JSON.stringify(remaining)));
    if (!remaining.length) {
      for (const name of await caches.keys()) {
        if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
      }
    }
  });
  cleaning = task.catch(() => {});
  return task;
}

self.addEventListener('install', event => {
  // A failed/partial download must never replace the working offline version.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      // Bound concurrency for phones and larger artwork collections.
      let index = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (index < urls.length) {
          const item = index++;
          const url = urls[item];
          const download = new URL(url);
          // Stable HTML/icon URLs must not pin an older CDN response to a new build.
          if (!url.startsWith(assets)) download.searchParams.set('studioodle-build', revision);
          const response = await fetch(new Request(download, { cache: url.startsWith(assets) ? 'force-cache' : 'reload', integrity: files[item].integrity }));
          if (!response.ok || response.type === 'opaque') throw Error('Offline download failed');
          await cache.put(url, response);
        }
      }));
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const previous = (await caches.keys()).some(name => name.startsWith(prefix) && name !== cacheName);
    const legacy = previous ? (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter(client => client.url.startsWith(scope)).map(client => client.id) : [];
    await (await caches.open(cacheName)).put(clientsKey, new Response(JSON.stringify(legacy)));
    await self.clients.claim();
    await cleanOldCaches();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const key = event.request.mode === 'navigate' && url.pathname.startsWith(new URL('./', self.location).pathname)
    ? appEntry : url.href;
  if (!allowed.has(key) && !url.href.startsWith(assets)) return;
  event.respondWith((async () => {
    const current = await (await caches.open(cacheName)).match(key);
    if (current) return current;
    if (url.href.startsWith(assets)) {
      for (const name of await caches.keys()) {
        if (!name.startsWith(prefix) || name === cacheName) continue;
        const historical = await (await caches.open(name)).match(key);
        if (historical) return historical;
      }
    }
    return fetch(event.request);
  })());
  event.waitUntil(cleanOldCaches());
});
