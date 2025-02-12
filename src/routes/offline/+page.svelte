<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { getOfflineArticles } from '$lib/storage/utils';
    import type { WikiArticle } from '$lib/types';
    import ArticleCard from '$lib/components/ArticleCard.svelte';

    let articles: WikiArticle[] = [];
    let loading = true;

    onMount(async () => {
        if (browser) {
            loading = true;
            try {
                articles = await getOfflineArticles();
            } catch (error) {
                console.error('Error loading offline articles:', error);
            } finally {
                loading = false;
            }
        }
    });
</script>

<div class="min-h-screen bg-black text-white/90">
    <div class="max-w-2xl mx-auto px-4 py-8">
        <div class="flex items-center gap-3 mb-8">
            <div class="bg-white/10 p-3 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 15H21M3 12H21M3 9H21M3 6H21M3 3H21" />
                    <path d="M3 18H21" stroke-dasharray="2 4" />
                </svg>
            </div>
            <h1 class="text-2xl font-medium">Offline Articles</h1>
        </div>

        {#if loading}
            <div class="flex items-center justify-center py-12">
                <div class="w-8 h-8 border-4 border-white/20 border-t-white/90 rounded-full animate-spin"></div>
            </div>
        {:else if articles.length === 0}
            <div class="text-center py-12 bg-white/5 rounded-2xl">
                <p class="text-white/60">No articles saved for offline reading</p>
                <a href="/" class="inline-block mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                    Return Home
                </a>
            </div>
        {:else}
            <div class="space-y-4">
                {#each articles as article (article.id)}
                    <div class="bg-white/5 rounded-2xl p-4">
                        <ArticleCard 
                            {article}
                            index={0}
                            currentVisibleIndex={0}
                            active={true}
                            showNavigationButtons={false}
                        />
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>
