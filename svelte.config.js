import adapter from "@sveltejs/adapter-netlify";
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter({
            edge: false,
            split: false
        }),
        alias: {
            $lib: './src/lib'
        },
        moduleExtensions: ['.js', '.ts'],
        files: {
            lib: 'src/lib',
            routes: 'src/routes',
            serviceWorker: 'src/lib/workers/worker.ts'
        },
        serviceWorker: {
            register: false
        },
        outDir: '.svelte-kit',
        appDir: '_app'
    }
};

export default config;
