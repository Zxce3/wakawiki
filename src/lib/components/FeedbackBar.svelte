<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import type { FeedbackType, WikiArticle, SupportedLanguage } from '$lib/types';
    import { storeFeedback } from '$lib/storage/utils';

    export let article: WikiArticle;
    export let score: number | undefined = undefined;
    export let onFeedback: (type: FeedbackType) => void;

    let feedbackGiven = false;
    let isLoading = false;
    let feedbackError: string | null = null;

    async function handleFeedback(type: FeedbackType) {
        if (feedbackGiven || isLoading) return;
        
        isLoading = true;
        feedbackError = null;

        try {
            await storeFeedback({
                articleId: article.id,
                feedbackType: type,
                timestamp: Date.now(),
                categories: article.categories,
                language: article.language as SupportedLanguage
            });
            
            feedbackGiven = true;
            onFeedback(type);
        } catch (error) {
            console.error('Feedback error:', error);
            feedbackError = 'Failed to save feedback. Please try again.';
        } finally {
            isLoading = false;
        }
    }
</script>

<div 
    class="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent pb-4 pt-8"
    transition:fade={{ duration: 200 }}
>
    <div class="max-w-screen-sm mx-auto px-4">
        {#if !feedbackGiven}
            <div class="bg-white/10 backdrop-blur rounded-lg p-4" transition:slide>
                <p class="text-white/90 text-sm text-center mb-3">
                    {#if score && score > 0.7}
                        Recommended based on your interests
                    {:else}
                        How's this article?
                    {/if}
                </p>
                
                {#if feedbackError}
                    <p class="text-red-400 text-sm text-center mb-3" transition:fade>
                        {feedbackError}
                    </p>
                {/if}

                <div class="flex justify-center gap-4">
                    <button
                        class="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-all disabled:opacity-50"
                        on:click={() => handleFeedback('more_like_this')}
                        disabled={isLoading}
                    >
                        {#if isLoading}
                            <div class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        {:else}
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/>
                            </svg>
                        {/if}
                        <span>More like this</span>
                    </button>

                    <button
                        class="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-all disabled:opacity-50"
                        on:click={() => handleFeedback('not_interested')}
                        disabled={isLoading}
                    >
                        {#if isLoading}
                            <div class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        {:else}
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/>
                            </svg>
                        {/if}
                        <span>Not interested</span>
                    </button>
                </div>
            </div>
        {:else}
            <div 
                class="text-center text-white/60 text-sm bg-white/5 backdrop-blur rounded-lg p-3" 
                transition:slide
            >
                <div class="flex items-center justify-center gap-2">
                    <svg class="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                    </svg>
                    <span>Thanks for your feedback!</span>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    button {
        transform: translateZ(0);
        will-change: transform, opacity;
    }

    button:active {
        transform: scale(0.95);
    }
</style>
