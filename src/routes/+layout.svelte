<script lang="ts">
    import "../app.css";
    import { browser } from "$app/environment";
    import { onMount } from "svelte";
    import { cleanupOldData } from "$lib/storage/utils";
    import { language } from "$lib/store/language";
    import { initialLoading, setLoading, isLoading } from "$lib/store/loading";
    import LoadingSpinner from "$lib/components/LoadingSpinner.svelte";
    import ReloadPrompt from "$lib/components/ReloadPrompt.svelte";

    let { children } = $props();
    let appInitialized = $state(false);

    // svelte-ignore non_reactive_update
    let pwaInfo: any;
    // svelte-ignore non_reactive_update
    let pwaAssetsHead: any;

    async function initPWA() {
        if (browser) {
            const pwaModule = await import("virtual:pwa-info");
            const pwaAssetsModule = await import("virtual:pwa-assets/head");
            pwaInfo = pwaModule.pwaInfo;
            pwaAssetsHead = pwaAssetsModule.pwaAssetsHead;
        }
    }

    onMount(() => {
        initPWA();
    });

    async function initApp() {
        if (!appInitialized && browser) {
            setLoading("initial", true, "Initializing app");
            try {
                const currentLang = await language.initialize();

                // Setup workers only in browser environment
                if (!window.recommendationsWorker) {
                    window.recommendationsWorker = new Worker(
                        new URL(
                            "$lib/workers/recommendations.ts",
                            import.meta.url,
                        ),
                        { type: "module" },
                    );
                    window.recommendationsWorker.postMessage({
                        language: currentLang,
                    });
                }

                if (!window.articleLoaderWorker) {
                    window.articleLoaderWorker = new Worker(
                        new URL(
                            "$lib/workers/articleLoader.ts",
                            import.meta.url,
                        ),
                        { type: "module" },
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
    {#if browser && pwaAssetsHead?.themeColor}
        <meta name="theme-color" content={pwaAssetsHead.themeColor.content} />
    {/if}
    {#if browser && pwaAssetsHead?.links}
        {#each pwaAssetsHead.links as link}
            <link {...link} />
        {/each}
    {/if}
    {#if browser}
        {@html pwaInfo?.webManifest.linkTag ?? ""}
    {/if}
</svelte:head>

<LoadingSpinner
    fullscreen
    message={$initialLoading.message}
    show={$isLoading && !appInitialized}
/>

<div class="min-h-screen bg-black text-white">
    {@render children()}
</div>

{#if browser}
    <ReloadPrompt />
{/if}
