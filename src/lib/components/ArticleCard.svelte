<script lang="ts">
    import { onMount } from 'svelte';
    import type { WikiArticle, FeedbackType, ArticleRecommendation, SupportedLanguage } from '../types';
    import { recordInteraction, handleLike, likedArticles } from '../store/articles';
    import FeedbackBar from './FeedbackBar.svelte';
    import LoadingSpinner from './LoadingSpinner.svelte';
    import { fetchArticleImages } from '../api/wikipedia';
    export let article: WikiArticle;
    export let active = false;
    export let score: number | undefined = undefined;
    export let isRecommended = false;
    export let showNavigationButtons = true; 
    export let onNavigate: ((direction: 'up' | 'down') => void) | undefined = undefined;
    export let recommendations: ArticleRecommendation[] = [];
    export const onRecommendationClick: ((rec: ArticleRecommendation) => void) | undefined = undefined;
    export let recommendationsLoading = false;
    export let index: number;
    export let currentVisibleIndex: number;

    $: isLiked = $likedArticles.has(article.id);
    $: showRecommendations = active && recommendations.length > 0;
    $: shouldLoadImage = index <= currentVisibleIndex + 1;
    $: isVisible = index === currentVisibleIndex;

    let imageElement: HTMLImageElement;
    let imageLoading = true;
    let containerElement: HTMLDivElement;
    let imageError = false;
    let hasRecordedView = false;
    let imagesFetched = false;

    let imageLoaded = false;
    let contentLoaded = false;
    let loadingError = false;

    
    const loadImage = async () => {
        if (!article.imageUrl || imageLoaded) return;
        
        try {
            const img = new Image();
            img.src = article.imageUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            imageLoaded = true;
        } catch (error) {
            loadingError = true;
            console.error('Error loading image:', error);
        }
    };

    
    $: if (active && !contentLoaded) {
        loadImage();
        contentLoaded = true;
    }

    $: if (isVisible && article.imagePending && !imagesFetched) {
        imagesFetched = true;
        fetchArticleImages(article.id, article.language as SupportedLanguage)
            .then(images => {
                article.imageUrl = images.imageUrl;
                article.thumbnail = images.thumbnail;
                article.imagePending = false;
            })
            .catch(() => {
                imageError = true;
                article.imagePending = false;
            })
            .finally(() => {
                imageLoading = false;
            });
    }

    $: if (active && !hasRecordedView) {
        hasRecordedView = true;
        recordInteraction(article, 'view');
    }

    function updateImageLayout() {
        if (!imageElement || !containerElement) return;

        requestAnimationFrame(() => {
            const img = imageElement;
            const container = containerElement;
            const imgAspect = img.naturalWidth / img.naturalHeight;
            const containerAspect = container.clientWidth / container.clientHeight;

            
            img.style.cssText = `
                opacity: 1;
                position: absolute;
                transition: opacity 0.3s ease;
                max-width: none;
                max-height: none;
            `;

            
            if (imgAspect > containerAspect) {
                img.style.width = '100%';
                img.style.height = 'auto';
                img.style.top = '50%';
                img.style.left = '0';
                img.style.transform = 'translateY(-50%)';
            } 
            
            else {
                img.style.height = '100%';
                img.style.width = 'auto';
                img.style.left = '50%';
                img.style.top = '0';
                img.style.transform = 'translateX(-50%)';
            }
        });
    }

    function handleImageLoad(event: Event) {
        imageElement = event.target as HTMLImageElement;
        imageLoading = false;
        imageError = false;
        updateImageLayout();
    }

    function handleImageError() {
        imageError = true;
        imageLoading = false;
    }

    onMount(() => {
        let resizeObserver: ResizeObserver | undefined;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
                if (imageElement && !imageLoading && !imageError) {
                    updateImageLayout();
                }
            });
            if (containerElement) {
                resizeObserver.observe(containerElement);
            }
        }

        return () => {
            resizeObserver?.disconnect();
        };
    });

    function handleLikeClick() {
        handleLike(article).then(() => {
            isLiked = $likedArticles.has(article.id);
        });
    }

    let showFullCaption = false;
    function toggleCaption() {
        showFullCaption = !showFullCaption;
    }

    function handleFeedback(event: CustomEvent<{ type: FeedbackType; article: WikiArticle }>) {
        const { type, article } = event.detail;
        if (type === 'more_like_this') {
            recordInteraction(article, 'like');
        }
    }
</script>

<div class="relative w-full h-full bg-black" bind:this={containerElement}>
    <!-- Loading state -->
    {#if !imageLoaded && !loadingError}
        <div class="absolute inset-0 flex items-center justify-center bg-black/50">
            <div class="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
        </div>
    {/if}

    <!-- Base background -->
    <div class="absolute inset-0 bg-gradient-to-b from-neutral-900/80 to-black/60"></div>

    <!-- Image container with optimized loading -->
    <div class="absolute inset-0">
        {#if article.imagePending}
            <div class="absolute inset-0 bg-gradient-to-b from-neutral-900 to-black"></div>
        {:else if article.imageUrl && shouldLoadImage}
            <div class="relative w-full h-full">
                <!-- Loading state -->
                {#if imageLoading}
                    <div class="absolute inset-0 flex items-center justify-center z-50">
                        <LoadingSpinner fullscreen={false} size="sm" message="Loading image" />
                    </div>
                {/if}
                
                <!-- Image with background handling -->
                <div class="absolute inset-0 bg-gradient-to-b from-neutral-900/40 to-black/30 opacity-50"></div>
                <img
                    src={article.imageUrl}
                    alt={article.title}
                    on:load={handleImageLoad}
                    on:error={handleImageError}
                    loading={isVisible ? "eager" : "lazy"}
                    fetchpriority={isVisible ? "high" : "low"}
                    class="object-cover w-full h-full"
                    class:opacity-0={imageLoading}
                    style="mix-blend-mode: overlay;"
                />

                <!-- Refined Gradient Overlays -->
                <div class="absolute inset-0 pointer-events-none">
                    <div class="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/30 to-transparent"></div>
                    <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/50 to-transparent"></div>
                </div>
            </div>
        {:else}
            <div class="absolute inset-0 bg-gradient-to-b from-neutral-900 to-black"></div>
        {/if}
    </div>

    <!-- Content container -->
    <div class="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-6">
        <!-- Add recommendation label if article is recommended -->
        {#if isRecommended && score}
            <div class="mb-3">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white/10 backdrop-blur-sm text-white/90">
                    {#if score > 0.8}
                        ⭐ Highly Recommended
                    {:else if score > 0.6}
                        📚 Similar Content
                    {:else}
                        💡 You Might Like
                    {/if}
                </span>
            </div>
        {/if}

        <div class="relative rounded-xl bg-black/30">
            <div class="relative max-w-[85%] @lg:max-w-[75%] space-y-3 @md:space-y-4 p-4 @md:p-5">
                <h2 class="text-lg @sm:text-xl @md:text-2xl @lg:text-3xl font-bold text-white/95 drop-shadow-sm">
                    {article.title}
                </h2>
                <div class="space-y-2">
                    <div class="relative max-h-[150px] overflow-y-auto custom-scrollbar" class:max-h-none={!showFullCaption}>
                        <button
                            type="button"
                            class="text-sm @md:text-base text-white/90 leading-relaxed cursor-pointer drop-shadow-sm pr-2 text-left w-full"
                            class:line-clamp-2={!showFullCaption}
                            on:click={toggleCaption}
                            on:keydown={(e) => e.key === 'Enter' && toggleCaption()}
                        >
                            {article.excerpt}
                        </button>
                    </div>
                    {#if (article.excerpt ?? '').length > 200}
                        <button
                            class="text-xs @md:text-sm text-white/75 hover:text-white transition-colors font-medium mt-2"
                            on:click={toggleCaption}
                        >
                            {showFullCaption ? 'Show less ↑' : 'Read more ↓'}
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <div class="absolute right-4 @md:right-6 @lg:right-8 bottom-6 @md:bottom-8 flex flex-col items-center gap-4 z-40">
        <button
            class="flex flex-col items-center group"
            class:text-red-500={isLiked}
            class:text-white={!isLiked}
            on:click={handleLikeClick}
            aria-label={isLiked ? 'Unlike' : 'Like'}
        >
            <div class="p-3 @md:p-4 rounded-full bg-black/40 hover:bg-black/60 transition-all active:scale-95 group-hover:scale-105">
                <svg class="w-6 h-6 @md:w-8 @md:h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 
                             2 5.42 4.42 3 7.5 3
                             c1.74 0 3.41.81 4.5 2.09
                             C13.09 3.81 14.76 3
                             16.5 3 19.58 3 22 5.42
                             22 8.5c0 3.78-3.4 6.86-8.55 11.54
                             L12 21.35z"/>
                </svg>
            </div>
            <span class="text-xs @md:text-sm mt-1 font-medium text-white/90">
                {isLiked ? 'Liked' : 'Like'}
            </span>
        </button>

        <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            class="flex flex-col items-center group"
            aria-label="Read article"
        >
            <div class="p-3 @md:p-4 rounded-full bg-black/40 hover:bg-black/60 transition-all active:scale-95 group-hover:scale-105">
                <svg class="w-6 h-6 @md:w-8 @md:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path 
                        stroke-linecap="round" 
                        stroke-linejoin="round" 
                        stroke-width="2" 
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10
                           a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
            </div>
            <span class="text-xs @md:text-sm mt-1 font-medium text-white/90">Read</span>
        </a>
    </div>

    {#if showNavigationButtons && onNavigate}
    <div class="absolute right-4 top-1/2 -translate-y-1/2 z-[50] hidden md:flex flex-col gap-4"> <!-- Decreased z-index from 102 to 50 -->
        <button
            class="p-3 rounded-full bg-black/40 hover:bg-black/60 transition-colors group"
            on:click={() => onNavigate('up')}
            aria-label="Navigate up"
        >
            <svg class="w-6 h-6 text-white group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path 
                    stroke-linecap="round"
                    stroke-linejoin="round" 
                    stroke-width="2" 
                    d="M5 15l7-7 7 7" 
                />
            </svg>
        </button>
        <button
            class="p-3 rounded-full bg-black/40 hover:bg-black/60 transition-colors group"
            on:click={() => onNavigate('down')}
            aria-label="Navigate down"
        >
            <!-- Fixed viewBox attribute here -->
            <svg class="w-6 h-6 text-white group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path 
                    stroke-linecap="round" 
                    stroke-linejoin="round" 
                    stroke-width="2" 
                    d="M19 9l-7 7-7-7"
                />
            </svg>
        </button>
    </div>
    {/if}

    {#if active && isRecommended && score && score > 0.5}
        <FeedbackBar
            {article}
            {score}
            onFeedback={(type) =>
                handleFeedback(new CustomEvent('feedback', { detail: { type, article } }))
            }
        />
    {/if}

    {#if recommendationsLoading}
        <div class="absolute bottom-4 right-4 z-50 bg-black/40 backdrop-blur rounded-full p-3">
            <div class="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
        </div>
    {/if}
</div>
