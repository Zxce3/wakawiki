/// <reference lib="webworker" />
/// <reference lib="es2015" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// Cache names
const CACHE_NAMES = {
    articles: 'articles-cache-v1',
    images: 'images-cache-v1',
    api: 'api-cache-v1',
    static: 'static-cache-v1'
};

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAMES.static).then(cache => 
            cache.add('/offline.html')
        )
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            cleanupOutdatedCaches()
        ])
    );
});

// API Routes
const API_ROUTES = [
    'api.wikipedia.org/w/api.php',
    'wikipedia.org/api/rest_v1'
];

// Cache the Wikipedia API responses
registerRoute(
    ({ url }) => API_ROUTES.some(route => url.href.includes(route)),
    new NetworkFirst({
        cacheName: CACHE_NAMES.api,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
            }),
            new CacheableResponsePlugin({
                statuses: [0, 200]
            })
        ]
    })
);

// Cache articles with background sync
const bgSyncPlugin = new BackgroundSyncPlugin('articles-queue', {
    maxRetentionTime: 24 * 60 // 24 hours in minutes
});

registerRoute(
    ({ url }) => url.pathname.includes('/page/'),
    new StaleWhileRevalidate({
        cacheName: CACHE_NAMES.articles,
        plugins: [
            bgSyncPlugin,
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
            })
        ]
    })
);

// Cache images with a Cache First strategy
registerRoute(
    ({ request }) => request.destination === 'image',
    new CacheFirst({
        cacheName: CACHE_NAMES.images,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
            }),
            new CacheableResponsePlugin({
                statuses: [0, 200]
            })
        ]
    })
);

// Cache static assets
registerRoute(
    ({ request }) => ['style', 'script', 'font'].includes(request.destination),
    new StaleWhileRevalidate({
        cacheName: CACHE_NAMES.static,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
            })
        ]
    })
);

// Handle cache cleanup
self.addEventListener('message', (event) => {
    if (event.data?.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(keys => Promise.all(
                keys.map(key => caches.delete(key))
            ))
        );
    }
});

// Precache static assets
precacheAndRoute(self.__WB_MANIFEST);
