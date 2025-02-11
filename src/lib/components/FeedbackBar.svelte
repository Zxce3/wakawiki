<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import type { FeedbackType, WikiArticle, SupportedLanguage } from '../types';
    import { storeFeedback } from '../storage/utils';

    export let article: WikiArticle;
    export let score: number | undefined = undefined;
    export let onFeedback: (type: FeedbackType) => void;

    let feedbackGiven = false;

    async function handleFeedback(type: FeedbackType) {
        if (feedbackGiven) return;
        
        feedbackGiven = true;
        await storeFeedback({
            articleId: article.id,
            feedbackType: type,
            timestamp: Date.now(),
            categories: article.categories,
            language: article.language as SupportedLanguage
        });
        
        onFeedback(type);
    }
</script>

<div 
    class="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent pb-4 pt-8"
    transition:fade
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
                <div class="flex justify-center gap-4">
                    <button
                        class="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 hover:bg-green-500/30 text-green-400"
                        on:click={() => handleFeedback('more_like_this')}
                    >
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/>
                        </svg>
                        <span>More like this</span>
                    </button>
                    <button
                        class="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400"
                        on:click={() => handleFeedback('not_interested')}
                    >
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/>
                        </svg>
                        <span>Not interested</span>
                    </button>
                </div>
            </div>
        {:else}
            <div class="text-center text-white/60 text-sm" transition:slide>
                Thanks for your feedback!
            </div>
        {/if}
    </div>
</div>
