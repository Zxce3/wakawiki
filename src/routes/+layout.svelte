<script lang="ts">
    import "../app.css";
    import { browser } from "$app/environment";
    import { onMount } from "svelte";
    import { cleanupOldData } from "$lib/storage/utils";
    import { language, setInitialLanguage } from "$lib/store/language";
    import { initialLoading, setLoading, isLoading } from "$lib/store/loading";
    import LoadingSpinner from "$lib/components/LoadingSpinner.svelte";
    import { getStoredLanguage } from "$lib/storage/utils";

    let appInitialized = false;

    onMount(async () => {
        if (browser && !appInitialized) {
            setLoading("initial", true, "Initializing app");
            try {
                const currentLang = await language.initialize();
                if (!window.recommendationsWorker) {
                    window.recommendationsWorker = new Worker(
                        new URL(
                            "$lib/workers/recommendations.ts",
                            import.meta.url,
                        ),
                        { type: "module" },
                    );
                    window.recommendationsWorker.postMessage({
                        type: "initialize",
                        categories: [],
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
                    window.articleLoaderWorker.postMessage({
                        type: "changeLanguage",
                        language: currentLang,
                    });
                }

                await cleanupOldData();
                appInitialized = true;
            } catch (error) {
                console.error("Initialization error:", error);
            } finally {
                setLoading("initial", false);
            }
        }
    });
</script>

<svelte:head>
    <title>WakaWiki</title>
</svelte:head>

<LoadingSpinner
    fullscreen
    message={$initialLoading.message}
    show={$isLoading && !appInitialized}
/>
<div class="min-h-screen bg-black text-white">
    <slot />
</div>
