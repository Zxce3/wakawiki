<script lang="ts">
    import { LANGUAGE_FLAGS } from '$lib/types';
    import type { SupportedLanguage, WikiArticle } from '$lib/types';
    import LanguageSelector from '$lib/components/LanguageSelector.svelte';
    import LikedArticles from '$lib/components/LikedArticles.svelte';
    import { setLoading } from '$lib/store/loading';
    import { Hash, Heart } from 'lucide-svelte';  // Add Lucide imports
    
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
                <Hash class="w-6 h-6 text-blue-400" />
            </div>
        </button>

        <button
            class="p-3 rounded-full bg-black/40 backdrop-blur transition-colors hover:bg-black/60"
            on:click={() => (showLikedArticles = true)}
            aria-label="Show Liked Articles"
        >
            <div class="flex items-center gap-2">
                <Heart class="w-6 h-6 text-red-500" fill="currentColor" />
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
