/* Generated production inputs; never registered by the Vite development server. */
const revision = __REVISION__;
const version = __VERSION__;
const files = __FILES__;
// Older workers delete every cache under their original prefix, including
// in-progress downloads. Keep this generation outside that deletion range.
const legacyPrefix = 'studioodle-offline-' + self.registration.scope;
const prefix = 'studioodle-offline-v2-' + self.registration.scope + '::';
const cacheName = prefix + revision;
const urls = files.map(file => new URL(file.url, self.location).href);
const allowed = new Set(urls);
const appEntry = new URL('./index.html', self.location).href;
const scope = new URL('./', self.location).href;
const assets = new URL('../assets/', self.location).href;
const clientsKey = new URL('./__offline_clients__', self.location).href;
let cleaning = Promise.resolve();
const isAppCache = name => name.startsWith(prefix) || name.startsWith(legacyPrefix);
let completed = 0, lastProgress = 0;
async function reportProgress(target) {
  const message = { type: 'STUDIOODLE_DOWNLOAD_PROGRESS', version, completed, total: urls.length };
  if (target) { target.postMessage(message); return; }
  for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
    if (client.url.startsWith(scope)) client.postMessage(message);
  }
}
self.addEventListener('message', event => {
  if (event.data?.type === 'STUDIOODLE_VERSION') event.ports[0]?.postMessage({ version, revision });
  if (event.data?.type === 'STUDIOODLE_PROGRESS') event.waitUntil(reportProgress(event.source));
});
function atLeastThisVersion(candidate) {
  if (!/^\d+\.\d+\.\d+$/.test(candidate)) return false;
  const a = candidate.split('.').map(Number), b = version.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

// Keep complete historical builds while their windows are still using them.
// Persist IDs so worker suspension/restart cannot forget an open drawing session.
function cleanOldCaches() {
  const task = cleaning.then(async () => {
    const cache = await caches.open(cacheName);
    const record = await cache.match(clientsKey);
    if (!record) return;
    const live = new Set((await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).map(client => client.id));
    const previous = await record.json();
    const remaining = previous.clients.filter(id => live.has(id));
    await cache.put(clientsKey, new Response(JSON.stringify({ clients: remaining, caches: previous.caches })));
    if (!remaining.length) {
      for (const name of previous.caches) {
        if (isAppCache(name) && name !== cacheName) await caches.delete(name);
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
          let response;
          try { response = await fetch(new Request(download, { cache: url.startsWith(assets) ? 'force-cache' : 'reload', integrity: files[item].integrity })); }
          catch (error) {
            if (!url.startsWith(assets)) throw error;
            response = await fetch(new Request(download, { cache: 'reload', integrity: files[item].integrity }));
          }
          if (!response.ok || response.type === 'opaque') throw Error('Offline download failed');
          await cache.put(url, response);
          completed++;
          if (completed === urls.length || Date.now() - lastProgress > 100) {
            lastProgress = Date.now(); await reportProgress();
          }
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
    const previous = [];
    for (const name of await caches.keys()) {
      if (!isAppCache(name) || name === cacheName) continue;
      // A newer download has no activation marker and must not be retired.
      if (!name.startsWith(prefix) || await (await caches.open(name)).match(clientsKey)) previous.push(name);
    }
    const legacy = previous.length ? (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter(client => client.url.startsWith(scope)).map(client => client.id) : [];
    await (await caches.open(cacheName)).put(clientsKey, new Response(JSON.stringify({ clients: legacy, caches: previous })));
    await self.clients.claim();
    await cleanOldCaches();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const navigation = event.request.mode === 'navigate' && url.href.startsWith(scope);
  const key = navigation
    ? appEntry : url.href;
  if (!allowed.has(key) && !url.href.startsWith(assets)) return;
  event.respondWith((async () => {
    if (navigation) {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 4000);
      try {
        const fresh = new URL(url); fresh.searchParams.set('studioodle-entry', Date.now());
        const response = await fetch(new Request(fresh, { cache: 'no-store', credentials: 'same-origin', signal: abort.signal }));
        if (response.ok) {
          const html = await response.clone().text();
          const candidate = html.match(/name="studioodle-version"\s+content="([^"]+)"/)?.[1];
          if (candidate && atLeastThisVersion(candidate)) return response;
        }
      } catch { /* Offline/slow launch uses the complete verified cached build. */ }
      finally { clearTimeout(timer); }
    }
    const current = await (await caches.open(cacheName)).match(key);
    if (current) return current;
    if (url.href.startsWith(assets)) {
      for (const name of await caches.keys()) {
        if (!isAppCache(name) || name === cacheName) continue;
        const historical = await (await caches.open(name)).match(key);
        if (historical) return historical;
      }
    }
    return fetch(event.request);
  })());
  event.waitUntil(cleanOldCaches());
});
