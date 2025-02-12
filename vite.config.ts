import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        sveltekit(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src/lib/workers',
            filename: 'worker.ts',
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
                theme_color: '#ffffff',
                background_color: '#ffffff',
                display: 'standalone',
                display_override: ['window-controls-overlay', 'minimal-ui', 'standalone'],
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
                globPatterns: [
                    '**/*.{js,css,html}',
                    '_app/**/*',
                    '*.{ico,png,svg,jpg,jpeg,gif,webp,avif,woff,woff2,ttf,otf}'
                ],
                clientsClaim: true,
                skipWaiting: true
            }
        })
    ],
    resolve: {
        alias: {
            '$workers': fileURLToPath(new URL('./src/lib/workers', import.meta.url))
        }
    },
    server: {
        host: true,
        // allowedHosts: ['0838-182-4-100-96.ngrok-free.app'],
    },
    worker: {
        format: 'es',
    }
});