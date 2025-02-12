import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// Take control immediately
self.skipWaiting();
clientsClaim();

// Clean up old caches
cleanupOutdatedCaches();

// Precache static assets
precacheAndRoute(self.__WB_MANIFEST);

// Cache the Wikipedia API responses
registerRoute(
    ({ url }) => url.origin === 'https://wikipedia.org',
    new NetworkFirst({
        cacheName: 'wikipedia-api',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 // 1 hour
            })
        ]
    })
);

// Cache images with a Cache First strategy
registerRoute(
    ({ request }) => request.destination === 'image',
    new CacheFirst({
        cacheName: 'images',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
            })
        ]
    })
);

// Update notification
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
