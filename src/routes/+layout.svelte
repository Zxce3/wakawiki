<script lang="ts">
    import "../app.css";
    import { browser } from "$app/environment";
    import { onMount } from "svelte";
    import { cleanupOldData } from "$lib/storage/utils";
    import { language } from "$lib/store/language";
    import { initialLoading, setLoading, isLoading } from "$lib/store/loading";
    import LoadingSpinner from "$lib/components/LoadingSpinner.svelte";
    import ReloadPrompt from "$lib/components/ReloadPrompt.svelte";
    import { pwaInfo } from 'virtual:pwa-info';
    import { pwaAssetsHead } from 'virtual:pwa-assets/head';
    import { useRegisterSW } from 'virtual:pwa-register/svelte';

    let { children } = $props();
    let appInitialized = $state(false);

    const {
        needRefresh,
        updateServiceWorker,
        offlineReady
    } = useRegisterSW({
        immediate: true,
        onRegistered(r: any) {
            console.log('SW Registered:', r);
        },
        onRegisterError(error: any) {
            console.error('SW registration error:', error);
        },
        onOfflineReady() {
            console.log('App ready to work offline');
        }
    });

    async function initApp() {
        if (!appInitialized) {
            setLoading("initial", true, "Initializing app");
            try {
                const currentLang = await language.initialize();
                
                // Setup workers
                if (!window.recommendationsWorker) {
                    window.recommendationsWorker = new Worker(
                        new URL("$lib/workers/recommendations.ts", import.meta.url),
                        { type: "module" }
                    );
                    window.recommendationsWorker.postMessage({ language: currentLang });
                }

                if (!window.articleLoaderWorker) {
                    window.articleLoaderWorker = new Worker(
                        new URL("$lib/workers/articleLoader.ts", import.meta.url),
                        { type: "module" }
                    );
                }

                await cleanupOldData();
                appInitialized = true;
            } catch (error) {
                console.error("Initialization error:", error);
            } finally {
                setLoading("initial", false);
            }
        }
    }

    onMount(() => {
        if (browser) {
            initApp();
        }
    });
</script>

<svelte:head>
    {#if pwaAssetsHead.themeColor}
        <meta name="theme-color" content={pwaAssetsHead.themeColor.content} />
    {/if}
    {#each pwaAssetsHead.links as link}
        <link {...link} />
    {/each}
    {@html pwaInfo?.webManifest.linkTag ?? ''}
</svelte:head>

<LoadingSpinner
    fullscreen
    message={$initialLoading.message}
    show={$isLoading && !appInitialized}
/>

<div class="min-h-screen bg-black text-white">
    {@render children()}
</div>

<ReloadPrompt />
