/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Navigation fallback: SPA routing — any unmatched navigation request
// returns the cached index.html so React Router can pick up the path.
registerRoute(
  new NavigationRoute(
    createHandlerBoundToURL('/smart-finance-companion/index.html'),
  ),
);

// Runtime cache: Google Fonts (replaces former generateSW config).
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  }),
);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Open the app on the saved route when a notification is clicked.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { route?: string };
  const targetPath = data.route ?? '/';
  // NB: keep in sync with `base` in vite.config.ts.
  const base = '/smart-finance-companion';
  const url = `${base}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientsList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try {
              await (client as WindowClient).navigate(url);
            } catch {
              // tolerate cross-origin navigate-failure
            }
          }
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
