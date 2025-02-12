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

// Update API route patterns to match Wikipedia endpoints
const WIKI_API_PATTERNS = [
    // API endpoints for different Wikipedia actions
    new RegExp('wikipedia\\.org/w/api\\.php'),
    new RegExp('wikipedia\\.org/api/rest_v1/'),
];

// Cache Wikipedia API responses
registerRoute(
    ({ url }) => WIKI_API_PATTERNS.some(pattern => pattern.test(url.href)),
    new NetworkFirst({
        cacheName: CACHE_NAMES.api,
        plugins: [
            new CacheableResponsePlugin({
                statuses: [0, 200],
                headers: {
                    'Access-Control-Allow-Origin': '*',
                }
            }),
            new ExpirationPlugin({
                maxEntries: 200, // Increased from 100
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
            }),
        ],
        networkTimeoutSeconds: 3
    })
);

// Cache article content
registerRoute(
    ({ url }) => url.pathname.includes('/page/') || url.pathname.includes('/summary/'),
    new StaleWhileRevalidate({
        cacheName: CACHE_NAMES.articles,
        plugins: [
            new CacheableResponsePlugin({
                statuses: [0, 200],
                headers: {
                    'Access-Control-Allow-Origin': '*',
                }
            }),
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
            }),
            new BackgroundSyncPlugin('articles-queue', {
                maxRetentionTime: 24 * 60 // 24 hours in minutes
            })
        ]
    })
);
