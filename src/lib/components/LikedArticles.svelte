<!-- 
    This Svelte component displays a list of liked articles.
    It supports different view modes (grid, list, story) and allows navigation between articles.
-->

<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { likedArticles, recordInteraction } from '../store/articles';
    import { getLikedArticlesData } from '../storage/utils';
    import ArticleCard from './ArticleCard.svelte';
    import type { WikiArticle } from '../types';
    import { LayoutGrid, List, Play, X } from 'lucide-svelte';  // Add Lucide imports
    
    interface TimestampedArticle extends WikiArticle {
        timestamp?: number;
        excerpt?: string;
    }
    
    export let isOpen = false; // Controls the visibility of the component
    export let onClose: () => void; // Function to call when the component is closed
    
    // svelte-ignore export_let_unused
    export let articles: WikiArticle[] = []; // List of articles to display
    // svelte-ignore export_let_unused
    export let onArticleSelect: (article: WikiArticle) => void; // Function to call when an article is selected

    let storedArticles: TimestampedArticle[] = []; // Articles with timestamps and excerpts

    let viewMode: 'grid' | 'list' | 'story' = 'list'; // Current view mode

    let currentStoryIndex = 0; // Index of the current story in story mode

    // Reactive statement to calculate the progress of the current story
    $: progress = ((currentStoryIndex + 1) / (likedList?.length || 1)) * 100;

    // Function to switch the view mode
    function switchView(newMode: typeof viewMode, index?: number) {
        viewMode = newMode;
        if (newMode === 'story' && typeof index === 'number') {
            currentStoryIndex = index;
        }
    }

    // Function to handle navigation between stories
    async function handleStoryView(article: WikiArticle) {
        if (!article) return;
        
        recordInteraction(article, 'view', {
            timeSpent: Date.now() - storyStartTime,
            scrollDepth: 1, // Stories are full-screen
            viewportTime: Date.now() - storyStartTime,
            readPercentage: 100 // Assume full read for stories
        });
    }

    let storyStartTime = Date.now();

    function handleNavigation(direction: 'prev' | 'next') {
        if (!likedList.length) return;
        
        // Record interaction for current story before changing
        if (likedList[currentStoryIndex]) {
            handleStoryView(likedList[currentStoryIndex]);
        }
        
        // Update story index
        if (direction === 'next') {
            currentStoryIndex = currentStoryIndex < likedList.length - 1 ? currentStoryIndex + 1 : 0;
        } else {
            currentStoryIndex = currentStoryIndex > 0 ? currentStoryIndex - 1 : likedList.length - 1;
        }
        
        // Reset timer for new story
        storyStartTime = Date.now();
    }

    onDestroy(() => {
        // Record final interaction when component is destroyed
        if (viewMode === 'story' && likedList[currentStoryIndex]) {
            handleStoryView(likedList[currentStoryIndex]);
        }
    });

    let touchStart = { x: 0, y: 0 }; // Initial touch position

    // Function to handle touch start event
    function handleTouchStart(e: TouchEvent) {
        touchStart = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
    }

    // Function to handle touch end event
    function handleTouchEnd(e: TouchEvent) {
        const deltaX = touchStart.x - e.changedTouches[0].clientX;
        const deltaY = touchStart.y - e.changedTouches[0].clientY;
        
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            handleNavigation(deltaX > 0 ? 'next' : 'prev');
        }
    }

    // Function to handle keydown events for navigation and closing
    function handleKeydown(event: KeyboardEvent) {
        if (!isOpen) return;
        switch (event.key) {
            case 'ArrowLeft':
                if (viewMode === 'story') handleNavigation('prev');
                break;
            case 'ArrowRight':
                if (viewMode === 'story') handleNavigation('next');
                break;
            case 'Escape':
                if (viewMode === 'story') {
                    switchView('grid');
                } else {
                    onClose();
                }
                break;
        }
    }

    // onMount lifecycle function to fetch liked articles and add event listeners
    onMount(() => {
        window.addEventListener('keydown', handleKeydown);

        (async () => {
            storedArticles = await getLikedArticlesData();
            storedArticles = storedArticles.map((article) => ({
                ...article,
                timestamp: (article as TimestampedArticle).timestamp || Date.now(),
                excerpt: article.excerpt || ''
            }));
        })();

        return () => {
            window.removeEventListener('keydown', handleKeydown);
        };
    });

    // Reactive statement to fetch liked articles when the component is opened
    $: if (isOpen) {
        getLikedArticlesData().then((articles) => {
            storedArticles = articles.map((article) => ({
                ...article,
                timestamp: (article as TimestampedArticle).timestamp || Date.now(),
                excerpt: article.excerpt || ''
            }));
        });
    }

    // Reactive statement to filter and sort liked articles
    $: likedList = storedArticles
        .filter((article) => $likedArticles.has(article.id))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Add function to check if image exists
    function hasValidImage(article: TimestampedArticle): boolean {
        return !!(article.imageUrl || article.thumbnail);
    }
</script>

<div
    class="fixed inset-0 z-[200] bg-black/95 transition-all duration-300"
    class:opacity-0={!isOpen}
    class:pointer-events-none={!isOpen}
    on:touchstart={handleTouchStart}
    on:touchend={handleTouchEnd}
>
    <!-- Header with progress bar and controls -->
    <header class="fixed top-0 left-0 right-0 z-[201]">
        <!-- Progress bar only if story mode -->
        {#if viewMode === 'story' && likedList.length > 0}
            <div class="h-1 bg-black/40 flex gap-1 px-1">
                {#each likedList as _, i (i)}
                    <div class="flex-1 rounded-full overflow-hidden bg-white/20">
                        <div
                            class="h-full bg-white transition-all duration-300 ease-linear"
                            style="width: {i < currentStoryIndex ? '100%' : i === currentStoryIndex ? progress : '0'}%"
                        ></div>
                    </div>
                {/each}
            </div>
        {/if}

        <!-- Navigation bar -->
        <nav class="flex justify-between items-center p-4">
            <!-- View toggles (grid, list, story) -->
            <div class="flex gap-2">
                <button
                    class="p-2 rounded-full transition-colors"
                    class:bg-white-20={viewMode === 'grid'}
                    class:bg-white-5={viewMode !== 'grid'}
                    class:hover:bg-white-30={viewMode !== 'grid'}
                    on:click={() => switchView('grid')}
                    aria-label="Switch to grid view"
                >
                    <LayoutGrid class="w-5 h-5 text-white" />
                </button>

                <button
                    class="p-2 rounded-full transition-colors"
                    class:bg-white-20={viewMode === 'list'}
                    class:bg-white-5={viewMode !== 'list'}
                    class:hover:bg-white-30={viewMode !== 'list'}
                    on:click={() => switchView('list')}
                    aria-label="Switch to list view"
                >
                    <List class="w-5 h-5 text-white" />
                </button>

                <button
                    class="p-2 rounded-full transition-colors"
                    class:bg-white-20={viewMode === 'story'}
                    class:bg-white-5={viewMode !== 'story'}
                    class:hover:bg-white-30={viewMode !== 'story'}
                    on:click={() => switchView('story')}
                    aria-label="Switch to story view"
                >
                    <Play class="w-5 h-5 text-white" />
                </button>
            </div>

            <!-- Right side: story indicator & close -->
            <div class="flex items-center gap-4">
                {#if viewMode === 'story' && likedList.length > 0}
                    <span class="text-white/80 text-sm">
                        {currentStoryIndex + 1} / {likedList.length}
                    </span>
                {/if}
                <button
                    class="p-2 rounded-full bg-white/10 hover:bg-white/20"
                    on:click={onClose}
                    aria-label="Close"
                >
                    <X class="w-6 h-6 text-white" />
                </button>
            </div>
        </nav>
    </header>

    <!-- Main content area -->
    <main class="h-screen pt-20 px-4 overflow-hidden">
        {#if likedList.length === 0}
            <div class="h-full flex items-center justify-center">
                <p class="text-white/80 text-xl">No liked articles yet</p>
            </div>
        {:else if viewMode === 'grid'}
            <div class="h-full overflow-y-auto pb-8">
                <!-- Grid layout -->
                <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {#each likedList as article, i (article.id)}
                        <button
                            class="group relative w-full overflow-hidden rounded-lg aspect-square bg-black/40"
                            on:click={() => switchView('story', i)}
                            aria-label={`View story for ${article.title}`}
                        >
                            {#if hasValidImage(article)}
                                <img
                                    src={article.imageUrl || article.thumbnail}
                                    alt={article.title}
                                    class="absolute inset-0 w-full h-full bg-neutral-700 object-cover transition-transform group-hover:scale-105"
                                    loading="lazy"
                                    on:error={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
                                />
                            {:else}
                                <div class="absolute inset-0 flex items-center justify-center">
                                    <svg class="w-18 h-18 text-white/20 bg-neutral-700" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm5 4a1 1 0 110-2 1 1 0 010 2zm4 4l-2-2-4 4h10l-4-6z" />
                                    </svg>
                                </div>
                            {/if}
                            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent group-hover:from-black/80 transition-all duration-300">
                                <div class="absolute bottom-0 p-2 sm:p-3 md:p-4 w-full">
                                    <h3 class="text-white font-medium text-sm line-clamp-2">
                                        {article.title}
                                    </h3>
                                </div>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        {:else if viewMode === 'list'}
            <div class="h-full overflow-y-auto pb-8">
                <div class="max-w-2xl mx-auto space-y-2">
                    {#each likedList as article, i (article.id)}
                        <button
                            class="flex items-center gap-4 p-3 rounded-lg bg-black/40 hover:bg-black/60 transition-colors w-full"
                            on:click={() => switchView('story', i)}
                            aria-label={`View story for ${article.title}`}
                        >
                            <div class="w-16 h-16 rounded overflow-hidden bg-neutral-700 flex-shrink-0">
                                {#if hasValidImage(article)}
                                    <img
                                        src={article.imageUrl || article.thumbnail}
                                        alt={article.title}
                                        class="w-full h-full object-cover"
                                        loading="lazy"
                                        on:error={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
                                    />
                                {:else}
                                    <div class="w-full h-full flex items-center justify-center">
                                        <svg class="w-8 h-8 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm5 4a1 1 0 110-2 1 1 0 010 2zm4 4l-2-2-4 4h10l-4-6z" />
                                        </svg>
                                    </div>
                                {/if}
                            </div>
                            <div class="flex-1 text-left">
                                <h3 class="text-white font-medium line-clamp-1">
                                    {article.title}
                                </h3>
                                <p class="text-white/60 text-sm mt-1 line-clamp-2">
                                    {article.excerpt}
                                </p>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        {:else}
            <!-- Story view -->
            <div class="h-full flex items-center justify-center">
                {#if likedList && likedList[currentStoryIndex]}
                    <ArticleCard
                        article={likedList[currentStoryIndex]}
                        active={true}
                        showNavigationButtons={false}
                        onNavigate={() => {}}
                        index={currentStoryIndex}
                        currentVisibleIndex={currentStoryIndex}
                    />
                {/if}
            </div>
            {#if viewMode === 'story' && likedList.length > 0}
                <!-- Large Screen Navigation Buttons -->
                <div class="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-[202] hidden md:flex justify-between pointer-events-none">
                    <button
                        class="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors pointer-events-auto backdrop-blur-sm
                            transform hover:scale-105 active:scale-95"
                        on:click={() => handleNavigation('prev')}
                        aria-label="Previous story"
                    >
                        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button
                        class="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors pointer-events-auto backdrop-blur-sm
                            transform hover:scale-105 active:scale-95"
                        on:click={() => handleNavigation('next')}
                        aria-label="Next story"
                    >
                        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            {/if}
        {/if}
    </main>
</div>

<style>
    .line-clamp-1,
    .line-clamp-2 {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .line-clamp-1 {
        -webkit-line-clamp: 1;
        line-clamp: 1;
    }
    .line-clamp-2 {
        -webkit-line-clamp: 2;
        line-clamp: 2;
    }

    .bg-white-20 {
        background-color: rgba(255, 255, 255, 0.2);
    }
    .bg-white-5 {
        background-color: rgba(255, 255, 255, 0.05);
    }
    .hover\:bg-white-30:hover {
        background-color: rgba(255, 255, 255, 0.3);
    }

    .transition-all {
        transition-property: all;
        transition-timing-function: linear;
        transition-duration: 300ms;
    }
</style>
