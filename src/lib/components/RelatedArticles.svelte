<script lang="ts">
    import type { WikiArticle } from "$lib/types";
    import { fade } from "svelte/transition";
    import LoadingSpinner from "./LoadingSpinner.svelte";
    import { fetchLinkedPages } from "$lib/api/wikipedia";
    import { language } from "$lib/store/language";

    export let isOpen = false;
    export let currentArticle: WikiArticle;
    export let onClose: () => void;
    export let onArticleSelect: (article: WikiArticle) => void;

    let relatedArticles: WikiArticle[] = [];
    let loading = true;
    let error: string | null = null;

    async function handleArticleSelect(article: WikiArticle) {
        try {
            // Validate article before selection
            if (!article?.id || !article?.title) {
                throw new Error('Invalid article data');
            }
            
            // Call the parent handler with validated article
            onArticleSelect(article);
            
            // Close modal after successful selection
            onClose();
        } catch (err) {
            console.error('Error selecting article:', err);
            error = 'Failed to load selected article';
        }
    }

    async function loadRelatedArticles() {
        loading = true;
        error = null;
        relatedArticles = []; // Reset articles before loading new ones

        try {
            if (!currentArticle?.id) {
                throw new Error('Invalid current article');
            }

            const articles = await fetchLinkedPages(currentArticle.id, $language);
            
            // Create a Map to ensure unique articles by ID
            const uniqueArticles = new Map();
            articles
                .filter(article => 
                    article?.id && 
                    article?.title && 
                    !article.title.startsWith('&') && 
                    article.title.length > 0
                )
                .forEach(article => {
                    if (!uniqueArticles.has(article.id)) {
                        uniqueArticles.set(article.id, article);
                    }
                });

            relatedArticles = Array.from(uniqueArticles.values());

        } catch (err) {
            console.error('Error loading related articles:', err);
            error = "Failed to load related articles";
        } finally {
            loading = false;
        }
    }

    $: if (isOpen && currentArticle) {
        loadRelatedArticles();
    }
</script>

{#if isOpen}
    <div class="fixed inset-0 z-[300] flex items-center justify-center p-4" transition:fade>
        <div class="bg-black/90 backdrop-blur-lg rounded-lg w-full max-w-lg max-h-[80vh] overflow-hidden shadow-xl">
            <div class="p-4 border-b border-white/10">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-semibold text-white">Related Articles</h2>
                    <button
                        class="p-2 hover:bg-white/10 rounded-full transition-colors"
                        on:click={onClose}
                        aria-label="Close modal"
                    >
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            <div class="p-4 overflow-y-auto max-h-[calc(80vh-4rem)]">
                {#if loading}
                    <div class="flex justify-center py-8">
                        <LoadingSpinner size="md" message="Loading related articles" show={true} />
                    </div>
                {:else if error}
                    <p class="text-red-400 text-center py-8">{error}</p>
                {:else if relatedArticles.length === 0}
                    <p class="text-white/70 text-center py-8">No related articles found</p>
                {:else}
                    <div class="space-y-4">
                        {#each relatedArticles as article, index (article.id + '-' + index)}
                            <button
                                class="w-full p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left flex gap-4 items-start"
                                on:click={() => handleArticleSelect(article)}
                                disabled={loading}
                            >
                                {#if article.thumbnail}
                                    <div class="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-black/20">
                                        <img
                                            src={article.thumbnail}
                                            alt=""
                                            class="w-full h-full object-cover"
                                            loading="lazy"
                                            on:error={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
                                        />
                                    </div>
                                {:else}
                                    <div class="flex-shrink-0 w-20 h-20 rounded-lg bg-white/5 flex items-center justify-center">
                                        <svg class="w-8 h-8 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm5 4a1 1 0 110-2 1 1 0 010 2zm4 4l-2-2-4 4h10l-4-6z" />
                                        </svg>
                                    </div>
                                {/if}
                                <div class="flex-1 min-w-0">
                                    <h3 class="text-lg font-medium text-white truncate">{article.title}</h3>
                                    {#if article.excerpt}
                                        <p class="text-white/70 text-sm mt-1 line-clamp-2">{article.excerpt}</p>
                                    {/if}
                                </div>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
