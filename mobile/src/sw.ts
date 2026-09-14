/// <reference lib="webworker" />
/**
 * PayInter service worker (injectManifest):
 *  - precaches the built app shell so the app boots offline
 *  - SPA navigation fallback → index.html
 *  - small NetworkFirst runtime cache for static API documents (meta/legal/fx)
 *    List/detail payloads are cached in IndexedDB by the app layer instead —
 *    with per-user namespacing, which the SW can't know about.
 */
import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigation: network-first so new deploys surface fast, offline → shell
registerRoute(
  new NavigationRoute(
    createHandlerBoundToURL('index.html'),
    { denylist: [/^\/v1\//, /^\/ops\//] }
  )
);

const locationOrigin = self.location.origin;
const E2B = /^https:\/\/\d{2,5}-.+\.e2b\.app$/;

const apiHosts = [new RegExp(`^${locationOrigin.replace(/\//g, '\\/')}$`), /^https:\/\/4000-.+\.e2b\.app$/];

function sameApiHost(url: URL): boolean {
  if (url.hostname !== self.location.hostname) return apiHosts.some((r) => r.test(url.origin));
  return true;
}

// low-change "document" endpoints the UI reads for banners/pairs/legal
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    sameApiHost(url) &&
    /^\/v1\/(meta\/bootstrap|legal\/[^/]+|fx\/rates)/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'payinter-api-docs',
    plugins: [new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 30 * 24 * 3600 })],
    networkTimeoutSeconds: 5
  })
);

// health probe is NEVER cached (connectivity UI needs the truth)
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/ops/'),
  new NetworkFirst({ cacheName: 'payinter-ops', networkTimeoutSeconds: 4, plugins: [new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 5 })] })
);

// everything else under /v1 → network only (app layer does its own IDB caching)
registerRoute(
  ({ url }) => sameApiHost(url) && url.pathname.startsWith('/v1/'),
  new StaleWhileRevalidate({ cacheName: 'payinter-unused', plugins: [new ExpirationPlugin({ maxEntries: 0, maxAgeSeconds: 1 })] })
);

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string })?.type === 'SKIP_WAITING') void self.skipWaiting();
});
void E2B; // retained for type narrowing of preview hosts

export {};
