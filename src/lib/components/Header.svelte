<script lang="ts">
    import { LANGUAGE_FLAGS } from '$lib/types';
    import type { SupportedLanguage, WikiArticle } from '$lib/types';
    import LanguageSelector from '$lib/components/LanguageSelector.svelte';
    import LikedArticles from '$lib/components/LikedArticles.svelte';
    import { setLoading } from '$lib/store/loading';
    
    export let language: keyof typeof LANGUAGE_FLAGS;
    export let likedCount: number;
    export let articles: WikiArticle[];
    export let onLanguageChange: (lang: SupportedLanguage) => Promise<void>;
    export let onArticleSelect: (article: WikiArticle) => Promise<void>;
    export let onRelatedSelect: () => void;

    let showLikedArticles = false;
    let showLanguageSelector = false;

    const onClose = () => {
        showLanguageSelector = false;
        setLoading("language", false);
    };

    const onSelect = async (newLang: SupportedLanguage) => {
        setLoading("language", true, `Changing to ${LANGUAGE_FLAGS[newLang]}`);
        await onLanguageChange(newLang);
        showLanguageSelector = false;
    };
</script>

<nav
    class="fixed top-0 inset-x-0 z-50 flex justify-between items-center p-4 max-w-[500px] mx-auto"
    aria-label="Main navigation"
>
    <button
        class="p-3 rounded-full bg-black/40 backdrop-blur transition-colors hover:bg-black/60"
        on:click={() => (showLanguageSelector = true)}
        aria-label="Select Language"
    >
        <span class="text-2xl">
            {LANGUAGE_FLAGS[language]}
        </span>
    </button>

    <div class="flex gap-2">
        <button
            class="p-3 rounded-full bg-black/40 backdrop-blur transition-colors hover:bg-black/60"
            on:click={onRelatedSelect}
            aria-label="Show Related Articles"
        >
            <div class="flex items-center gap-2">
                <svg
                    class="w-6 h-6 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                    />
                </svg>
            </div>
        </button>

        <button
            class="p-3 rounded-full bg-black/40 backdrop-blur transition-colors hover:bg-black/60"
            on:click={() => (showLikedArticles = true)}
            aria-label="Show Liked Articles"
        >
            <div class="flex items-center gap-2">
                <svg
                    class="w-6 h-6 text-red-500"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                    />
                </svg>
                <span class="text-white font-medium">{likedCount}</span>
            </div>
        </button>
    </div>
</nav>

{#if showLanguageSelector || showLikedArticles}
    <div class="fixed inset-0 z-[200] bg-black/80">
        {#if showLanguageSelector}
            <LanguageSelector isOpen={true} {onClose} {onSelect} />
        {:else if showLikedArticles}
            <LikedArticles
                isOpen={true}
                {articles}
                onClose={() => (showLikedArticles = false)}
                {onArticleSelect}
            />
        {/if}
    </div>
{/if}
