import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';

export default defineConfig({
    plugins: [sveltekit()],
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