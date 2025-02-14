import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { SvelteKitPWA } from '@vite-pwa/sveltekit'

export default defineConfig({
    plugins: [
        sveltekit(),
        SvelteKitPWA({
            strategies: 'generateSW',
            registerType: 'autoUpdate',
            devOptions: {
                enabled: true,
                type: 'module'
            },
            manifest: {
                id: '/',
                name: 'WakaWiki',
                short_name: 'WakaWiki',
                description: 'A Wikipedia reader app',
                theme_color: '#000000',
                background_color: '#000000',
                display: 'fullscreen',
                display_override: ['window-controls-overlay', 'fullscreen', 'minimal-ui', 'standalone'],
                orientation: 'portrait',
                start_url: '/',
                icons: [
                    {
                        src: 'logo.svg',
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'any'
                    },
                    {
                        src: 'logo.svg',
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'maskable'
                    },
                    // Fallbacks for older browsers
                    {
                        src: 'logo-192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'logo-512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ],
                screenshots: [
                    // Desktop screenshot
                    {
                        src: "screenshot-desktop.png",
                        sizes: "1920x1080",
                        type: "image/png",
                        form_factor: "wide",
                        label: "WakaWiki Desktop View"
                    },
                    // Mobile screenshot
                    {
                        src: "screenshot-mobile.png",
                        sizes: "1080x1920",
                        type: "image/png",
                        label: "WakaWiki Mobile View"
                    }
                ],
            },
            workbox: {
                globDirectory: '.svelte-kit/output',
                globPatterns: [
                    '**/*.{html,js,css,png,jpg,gif,svg,webp,woff,woff2,ttf,eot,ico}',
                ],
                globIgnores: [
                    '**/node_modules/**/*',
                    'sw.js',
                    'workbox-*.js'
                ],
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                skipWaiting: true
            },
            kit: {
                appDir: '_app',
                includeVersionFile: true,
                outDir: '.svelte-kit'
            }
        }),
    ],
    define: {
        'process.env.NODE_ENV': process.env.NODE_ENV === 'production' 
            ? '"production"'
            : '"development"'
    },
    server: {
        host: true
    },
    worker: {
        format: 'es',
        plugins: () => [{
            name: 'sveltekit-env',
            resolveId(id) {
                if (id === '$app/environment') {
                    return '\0virtual:$app/environment';
                }
            },
            load(id) {
                if (id === '\0virtual:$app/environment') {
                    return 'export const browser = true; export const dev = import.meta.env.DEV;';
                }
            }
        }]
    },
    resolve: {
        preserveSymlinks: true,
        conditions: ['browser', 'module', 'default']
    },
    build: {
        target: 'esnext',
        modulePreload: {
            polyfill: false
        },
        rollupOptions: {
            external: [
                'node:path',
                'node:url',
                'node:fs',
                'node:module'
            ]
        }
    },
    ssr: {
        noExternal: ['__sveltekit/**']
    }
});