/// <reference lib="webworker" />
/// <reference lib="es2015" />

import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// Set cache name details
setCacheNameDetails({
    prefix: 'wakawiki',
    suffix: 'v1',
    precache: 'precache',
    runtime: 'runtime'
});

// Cache names with versioning
const CACHE_NAMES = {
    articles: 'wakawiki-articles-v1',
    images: 'wakawiki-images-v1',
    api: 'wakawiki-api-v1',
    static: 'wakawiki-static-v1',
    recommendations: 'wakawiki-recommendations-v1'
};

// Precaching configuration
const precacheManifest = self.__WB_MANIFEST || [];
precacheAndRoute([
    ...precacheManifest,
    {
        url: '/offline.html',
        revision: '1'
    }
]);

// Handle navigation requests
const handler = createHandlerBoundToURL('/');
const navigationRoute = new NavigationRoute(handler, {
    allowlist: [new RegExp('^(?!/api/).*')],
});
registerRoute(navigationRoute);

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            cleanupOutdatedCaches(),
            // Clear old caches
            caches.keys().then(keys => 
                Promise.all(
                    keys.filter(key => !Object.values(CACHE_NAMES).includes(key))
                        .map(key => caches.delete(key))
                )
            )
        ])
    );
});

// Wikipedia API patterns
const WIKI_API_PATTERNS = [
    new RegExp('wikipedia\\.org/w/api\\.php'),
    new RegExp('wikipedia\\.org/api/rest_v1/'),
];

// API response caching with CORS handling
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
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24
            })
        ],
        networkTimeoutSeconds: 3,
        matchOptions: {
            ignoreVary: true // Handle Vary header
        }
    })
);

// Article content caching
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
                maxAgeSeconds: 60 * 60 * 24 * 7
            }),
            new BackgroundSyncPlugin('articles-queue', {
                maxRetentionTime: 24 * 60
            })
        ],
        matchOptions: {
            ignoreVary: true
        }
    })
);

// Recommendation caching with proper headers
registerRoute(
    ({ url }) => url.pathname.includes('/recommendations/'),
    new StaleWhileRevalidate({
        cacheName: CACHE_NAMES.recommendations,
        plugins: [
            new CacheableResponsePlugin({
                statuses: [0, 200],
                headers: {
                    'Access-Control-Allow-Origin': '*',
                }
            }),
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 60 * 15 // 15 minutes
            }),
            new BackgroundSyncPlugin('recommendations-queue', {
                maxRetentionTime: 60
            })
        ],
        matchOptions: {
            ignoreVary: true
        }
    })
);

// Add image caching route
registerRoute(
    ({ request }) => request.destination === 'image' || 
                     request.url.includes('/thumb/') || 
                     request.url.includes('wikipedia.org/api/rest_v1/page/summary'),
    new CacheFirst({
        cacheName: CACHE_NAMES.images,
        plugins: [
            new CacheableResponsePlugin({
                statuses: [0, 200],
                headers: {
                    'Access-Control-Allow-Origin': '*',
                }
            }),
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
            })
        ],
        matchOptions: {
            ignoreVary: true
        }
    })
);

// Add specific Wikipedia image handling
registerRoute(
    ({ url }) => url.pathname.includes('/wikipedia/commons/') || 
                 url.pathname.includes('/wikipedia/en/'),
    new CacheFirst({
        cacheName: CACHE_NAMES.images,
        plugins: [
            new CacheableResponsePlugin({
                statuses: [0, 200]
            }),
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
            })
        ]
    })
);

// Handle offline fallback
registerRoute(
    ({ request }) => request.mode === 'navigate',
    new NetworkFirst({
        cacheName: CACHE_NAMES.static,
        plugins: [
            new CacheableResponsePlugin({
                statuses: [200]
            })
        ],
        networkTimeoutSeconds: 3
    })
);

// Cache cleanup on quota exceeded
self.addEventListener('quotaexceeded', () => {
    caches.keys().then(keys => 
        Promise.all(
            keys.map(key => caches.delete(key))
        )
    );
});
