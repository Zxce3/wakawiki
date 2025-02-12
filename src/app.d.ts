/// <reference types="vite-plugin-pwa/svelte" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/client" />
import 'vite-plugin-pwa/pwa-assets';

declare module 'virtual:pwa-assets/head' {
    interface PWAAssetsHead {
        themeColor: { content: string } | null;
        links: Array<{ rel: string; href: string; sizes?: string; type?: string }>;
    }
    export const pwaAssetsHead: PWAAssetsHead;
}

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

    // Add PWA registration types
    interface ImportMetaEnv {
        readonly PWA_ENABLED: boolean;
    }

    // Extend Window interface with PWA workers
    interface Window {
        recommendationsWorker?: Worker;
        articleLoaderWorker?: Worker;
        workbox?: {
            messageSkipWaiting(): void;
            register(): void;
        };
    }
}

// Add PWA virtual modules
declare module 'virtual:pwa-register/svelte' {
    import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
    
    export interface RegisterSWConfig extends RegisterSWOptions {
        immediate?: boolean;
        onNeedRefresh?: () => void;
        onOfflineReady?: () => void;
        onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
        onRegisterError?: (error: any) => void;
    }
    
    export function useRegisterSW(options?: RegisterSWConfig): {
        needRefresh: import('svelte/store').Writable<boolean>;
        offlineReady: import('svelte/store').Writable<boolean>;
        updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
    };
}

declare module '$service-worker' {
    export type {};
}

export {};
