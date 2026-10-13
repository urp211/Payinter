/* PayInter PWA service worker — app-shell cache, network-first API. */
const SW_VERSION = 'payinter-pwa-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SW_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.hostname !== self.location.hostname || url.pathname.startsWith('/v1') || url.pathname.startsWith('/ops')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && e.request.method === 'GET') {
        const copy = res.clone();
        caches.open(SW_VERSION).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
