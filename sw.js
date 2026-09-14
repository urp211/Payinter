// Payinter Service Worker - Offline First
const CACHE_NAME = 'payinter-v2';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/db.js',
  '/js/app.js',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png'
];

// Install - precache
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - Cache First, Network Fallback, Offline Fallback
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET
  if (req.method !== 'GET') return;

  // For navigation requests, try network first then cache, then offline page
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          // update cache
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => {
          return caches.match(req).then(cached => {
            return cached || caches.match('/index.html') || caches.match('/');
          });
        })
    );
    return;
  }

  // For other assets: Cache First
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // background revalidate
        event.waitUntil(
          fetch(req).then(networkRes => {
            if (networkRes && networkRes.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(req, networkRes));
            }
          }).catch(()=>{})
        );
        return cached;
      }
      return fetch(req).then(networkRes => {
        if (networkRes && networkRes.status === 200) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return networkRes;
      }).catch(() => {
        // offline fallback for images
        if (req.destination === 'image') {
          return caches.match('/icons/icon-192.png');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// Background Sync (future)
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync', event.tag);
});

// Push (future - for bill reminders offline notifications)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Payinter', body: 'Lembrete de pagamento' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      vibrate: [100, 50, 100],
      data: { url: '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
