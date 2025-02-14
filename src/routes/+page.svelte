<script lang="ts">
    export let data;
    import { onMount, tick } from "svelte";
    import { browser } from "$app/environment";
    import {
        articles,
        loadMoreArticles,
        likedArticles,
        recommendations,
        articleBuffer,
        type InteractionType,
        recordInteraction,
    } from "$lib/store/articles";
    import { language } from "$lib/store/language";
    import ArticleCard from "$lib/components/ArticleCard.svelte";
    import LanguageSelector from "$lib/components/LanguageSelector.svelte";
    import LikedArticles from "$lib/components/LikedArticles.svelte";
    import type { SupportedLanguage, WikiArticle } from "$lib/types";
    import { articleLoading } from "$lib/store/loading";
    import type { ArticleRecommendation } from "$lib/types";
    import { getRandomProjectAd } from "$lib/config/projects";
    import ProjectAd from "$lib/components/ProjectAd.svelte";
    import { languageLoading, setLoading } from "$lib/store/loading";
    import LoadingSpinner from "$lib/components/LoadingSpinner.svelte";
    import { fade } from "svelte/transition";
    import { getStoredLanguage, hasOfflineContent, getOfflineArticles } from "$lib/storage/utils";
    import RelatedArticles from "$lib/components/RelatedArticles.svelte";
    import { LANGUAGE_FLAGS } from "$lib/types";
    import Header from "$lib/components/Header.svelte";
    import SvelteSeo from "$lib/components/SvelteSeo.svelte";
    import { goto } from "$app/navigation";
    import { WifiOff, Wifi, X } from 'lucide-svelte';  // Add Lucide imports


    // Add these constants for virtual scrolling
    const VISIBLE_ITEMS = 5; // Number of items to keep rendered
    const BUFFER_ITEMS = 2; // Number of items to keep in buffer above/below

    // Add these variables for scroll optimization
    let visibleRange = { start: 0, end: VISIBLE_ITEMS };
    let containerHeight = 0;
    let itemHeight = 0;

    $: if ((data as any).initialLanguage && browser) {
        language.set((data as any).initialLanguage as SupportedLanguage);
        articles.set((data as any).initialArticles);
    } else if (browser) {
        getStoredLanguage().then((storedLang) => {
            if (storedLang) {
                language.set(storedLang as SupportedLanguage);
            }
        });
    }

    let currentIndex = 0;
    let showRelatedArticles = false;

    let touchStart = 0;
    let touchEnd = 0;
    let lastVisibleIndex = 0;

    let articlesContainer: HTMLElement;

    let articlesLoading = false;
    let isPortrait = true;

    if (browser) {
        window.recommendationsWorker?.addEventListener("message", (event) => {
            const newRecs: ArticleRecommendation[] = event.data;
            recommendations.set(
                new Map(newRecs.map((rec) => [rec.articleId, rec.score])),
            );
        });
    }

    // Add these variables for touch tracking
    let touchStartX = 0;
    let touchStartY = 0;

    // Add touch event options

    function handleTouchStart(e: TouchEvent) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStart = e.changedTouches[0].screenY;
    }

    function handleTouchEnd(e: TouchEvent) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        touchEnd = e.changedTouches[0].screenY;

        // Calculate swipe distance and direction
        const deltaX = touchStartX - touchEndX;
        const deltaY = touchStartY - touchEndY;

        // Only handle horizontal swipe if it's more horizontal than vertical
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 50) {
                // Left swipe
                showRelatedArticles = true;
            }
        } else {
            // Handle vertical swipe as before
            const diff = touchStart - touchEnd;
            if (Math.abs(diff) > 50) {
                if (diff > 0 && currentIndex < $articles.length - 1) {
                    currentIndex++;
                } else if (diff < 0 && currentIndex > 0) {
                    currentIndex--;
                }
            }
        }
    }

    function handleNavigate(direction: "up" | "down") {
        if (direction === "up" && currentIndex > 0) {
            currentIndex--;
        } else if (
            direction === "down" &&
            currentIndex < $articles.length - 1
        ) {
            currentIndex++;
        }
    }

    function scrollToArticle(direction: "up" | "down") {
        if (!articlesContainer) return;

        const currentScroll = articlesContainer.scrollTop;
        const windowHeight = window.innerHeight;

        let targetScroll = currentScroll;
        if (direction === "up") {
            targetScroll = Math.max(0, currentScroll - windowHeight);
        } else {
            targetScroll = Math.min(
                articlesContainer.scrollHeight - windowHeight,
                currentScroll + windowHeight,
            );
        }

        articlesContainer.scrollTo({
            top: targetScroll,
            behavior: "smooth",
        });
    }

    async function handleLanguageChange() {
        setLoading("language", true, "Changing language");

        try {
            await loadMoreArticles(5);
        } finally {
            setLoading("language", false);
        }
    }

    let isLoading = false;

    let contentReady = false;
    let initialLoadComplete = false;

    const INITIAL_LOAD_TIMEOUT = 3000;
    const LOAD_BATCH_SIZE = 3;
    let initialLoadTimer: NodeJS.Timeout;
    let loadingBatch = false;

    let isOffline = !navigator.onLine;
    let showOfflineMessage = false;
    let showOnlineMessage = false;

    // Add online/offline detection
    onMount(() => {
        window.addEventListener('online', handleOnlineStatus);
        window.addEventListener('offline', handleOnlineStatus);
        return () => {
            window.removeEventListener('online', handleOnlineStatus);
            window.removeEventListener('offline', handleOnlineStatus);
        };
    });

    async function handleOnlineStatus() {
        const wasOffline = isOffline;
        isOffline = !navigator.onLine;
        
        if (isOffline) {
            showOfflineMessage = true;
            showOnlineMessage = false;
            loadOfflineContent();
        } else if (wasOffline) {
            showOnlineMessage = true;
            showOfflineMessage = false;
            
            // Clear existing articles
            articles.set([]);
            
            try {
                // Reload fresh articles
                await loadArticleBatch(5);
                
                // Refresh the current page after a short delay
                setTimeout(async () => {
                    await goto(window.location.pathname, { replaceState: true });
                    showOnlineMessage = false;
                }, 1500);
            } catch (error) {
                console.error("Error refreshing content:", error);
            }
        }
    }

    async function loadOfflineContent() {
        if (hasOfflineContent()) {
            const offlineArticles = await getOfflineArticles();
            articles.set(offlineArticles);
        }
    }

    onMount(async () => {
        if (browser) {
            setLoading("initial", true, "Loading your articles");

            // Set timeout for initial load
            initialLoadTimer = setTimeout(() => {
                setLoading("initial", false);
                initialLoadComplete = true;
            }, INITIAL_LOAD_TIMEOUT);

            try {
                if ($articles.length === 0) {
                    // Load initial batch immediately
                    await loadArticleBatch(LOAD_BATCH_SIZE);
                    contentReady = true;
                }
            } catch (error) {
                console.error("Initial load failed:", error);
            } finally {
                clearTimeout(initialLoadTimer);
                setLoading("initial", false);
                initialLoadComplete = true;
            }
        }
    });

    async function loadArticleBatch(count: number) {
        if (!browser || loadingBatch) return;

        loadingBatch = true;
        setLoading("article", true, "Loading articles");

        try {
            await loadMoreArticles(count);
        } catch (error) {
            console.error("Error loading articles:", error);
        } finally {
            loadingBatch = false;
            setLoading("article", false);
        }
    }

    const SCROLL_TRIGGER_THRESHOLD = 0.8;
    let lastScrollTop = 0;

    // Function to update visible range based on scroll position
    function updateVisibleRange(scrollTop: number) {
        const newIndex = Math.floor(scrollTop / itemHeight);
        const start = Math.max(0, newIndex - BUFFER_ITEMS);
        const end = Math.min(
            $articles.length,
            newIndex + VISIBLE_ITEMS + BUFFER_ITEMS,
        );

        if (start !== visibleRange.start || end !== visibleRange.end) {
            visibleRange = { start, end };
        }
    }

    // Modified scroll handler
    function handleScroll(e: Event) {
        if (loadingBatch) return;

        const container = e.target as HTMLElement;
        const { scrollTop, clientHeight, scrollHeight } = container;

        // Update which items should be visible
        updateVisibleRange(scrollTop);

        // Rest of existing scroll handler logic
        // Detect scroll direction
        const scrollingDown = scrollTop > lastScrollTop;
        lastScrollTop = scrollTop;

        if (scrollingDown) {
            const scrolledPercentage =
                (scrollTop + clientHeight) / scrollHeight;
            if (scrolledPercentage > SCROLL_TRIGGER_THRESHOLD) {
                loadMoreArticles(3);
            }
        }

        // Update current index based on scroll position
        const newIndex = Math.floor(scrollTop / clientHeight);
        if (newIndex !== currentIndex) {
            currentIndex = newIndex;
            lastVisibleIndex = newIndex;
            const visibleArticle = $articles[newIndex];
            if (visibleArticle) handleArticleView(visibleArticle);
        }

        // Track interaction for visible article
        if ($articles[currentIndex]) {
            handleArticleInteraction($articles[currentIndex], 'view');
        }
    }

    // Calculate item height on mount
    onMount(() => {
        if (browser) {
            itemHeight = window.innerHeight; // Each article takes full viewport height
            containerHeight = itemHeight * $articles.length;
        }
    });

    // Update container height when articles change
    $: if (browser) {
        containerHeight = itemHeight * $articles.length;
    }

    // Initial load
    onMount(async () => {
        if (browser) {
            if ($articles.length === 0) {
                loadingBatch = true;
                try {
                    await loadMoreArticles(5);
                } finally {
                    loadingBatch = false;
                }
            }
        }
    });

    // Add reactive statement for content readiness

    async function handleArticleChange(article: WikiArticle) {
        if (!browser || !window.recommendationsWorker || isLoading) return;

        $recommendations = new Map();
        window.recommendationsWorker.postMessage([
            {
                articleId: article.id,
                type: "view",
                timestamp: Date.now(),
                language: $language,
            },
        ]);
    }

    function handleArticleView(article: WikiArticle) {
        if (browser && window.recommendationsWorker) {
            window.recommendationsWorker.postMessage([
                {
                    articleId: article.id,
                    type: "view",
                    timestamp: Date.now(),
                    language: $language,
                },
            ]);
        }
    }

    const MIN_ARTICLES_BEFORE_FIRST_AD = 30;
    const AD_INTERVAL = 50;

    export function shouldShowAd(index: number): boolean {
        if (index < MIN_ARTICLES_BEFORE_FIRST_AD) {
            return false;
        }

        return (index - MIN_ARTICLES_BEFORE_FIRST_AD) % AD_INTERVAL === 0;
    }

    async function handleArticleSelect(article: WikiArticle) {
        if (!article?.title || !article?.id) {
            console.warn("Invalid article selected:", article);
            return;
        }

        showRelatedArticles = false;
        setLoading("article", true, "Loading selected article");

        try {
            // Insert the selected article after the current one
            const currentIdx = currentIndex;
            articles.update((existing) => {
                const newArticles = [...existing];
                newArticles.splice(currentIdx + 1, 0, article);
                return newArticles;
            });

            // Wait for DOM update
            await tick();

            // Scroll to the newly added article
            const targetIndex = currentIdx + 1;
            currentIndex = targetIndex;

            if (articlesContainer) {
                const windowHeight = window.innerHeight;
                articlesContainer.scrollTo({
                    top: windowHeight * targetIndex,
                    behavior: "smooth",
                });
            }

            await handleArticleChange(article);
        } catch (error) {
            console.error("Error handling selected article:", error);
        } finally {
            setLoading("article", false);
        }

        handleArticleInteraction(article, 'click');
    }

    function isArticleVisible(index: number): boolean {
        return index === lastVisibleIndex;
    }

    onMount(() => {
        if (browser) {
            if ($articles.length === 0) {
                loadArticleBatch(5);
            }
        }
    });

    function handleArticleInteraction(article: WikiArticle, action: InteractionType) {
        const metadata = {
            timeSpent: 0,
            scrollDepth: 0,
            viewportTime: 0,
            readPercentage: 0
        };

        if (articlesContainer) {
            const containerHeight = articlesContainer.scrollHeight;
            const scrollDepth = (articlesContainer.scrollTop + window.innerHeight) / containerHeight;
            metadata.scrollDepth = scrollDepth;
        }

        recordInteraction(article, action, metadata);
    }
</script>

<!-- Always render SvelteSeo, passing null during loading -->
<SvelteSeo article={$articles.length > 0 ? $articles[currentIndex] : null} />

{#if $articles.length > 0}
    <SvelteSeo article={$articles[currentIndex]} />
{/if}

<div class="fixed inset-0 bg-black">
    {#if !initialLoadComplete}
        <div class="absolute inset-0 flex items-center justify-center z-50">
            <LoadingSpinner
                size="lg"
                message="Loading your articles"
                show={true}
                fullscreen={true}
            />
        </div>
    {:else if $articles.length === 0}
        <div class="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner size="md" message="Finding articles" show={true} />
        </div>
    {:else}
        <div
            class="mx-auto h-full relative overflow-hidden bg-black transition-opacity duration-300"
            class:max-w-[500px]={isPortrait}
            class:opacity-0={!contentReady}
            class:opacity-100={contentReady}
        >
            <Header
                language={$language}
                likedCount={$likedArticles.size}
                articles={$articles}
                onLanguageChange={handleLanguageChange}
                onArticleSelect={handleArticleSelect}
                onRelatedSelect={() => (showRelatedArticles = true)}
            />
            
            <div
                class="fixed right-8 top-1/2 -translate-y-1/2 z-[102] hidden md:flex flex-col gap-4"
            >
                <button
                    class="p-3 rounded-full bg-black/40 hover:bg-black/60 transition-colors group"
                    on:click={() => scrollToArticle("up")}
                    aria-label="Scroll Up"
                >
                    <svg
                        class="w-6 h-6 text-white group-hover:scale-110 transition-transform"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
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
                    on:click={() => scrollToArticle("down")}
                    aria-label="Scroll Down"
                >
                    <svg
                        class="w-6 h-6 text-white group-hover:scale-110 transition-transform"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>
            </div>

            <main
                class="h-full w-full overflow-y-auto snap-y snap-mandatory scrollbar-none relative"
                bind:this={articlesContainer}
                on:scroll={handleScroll}
                role="feed"
                aria-busy={loadingBatch}
                aria-label="Articles feed"
            >
                <!-- Set container height to maintain scroll area -->
                <div
                    class="absolute inset-x-0"
                    style="height: {containerHeight}px"
                >
                    {#each $articles.slice(visibleRange.start, visibleRange.end) as article, index (article.id + "-" + (index + visibleRange.start))}
                        <article
                            class="article-container snap-start absolute w-full"
                            style="transform: translateY({(index +
                                visibleRange.start) *
                                100}vh)"
                            on:touchstart={handleTouchStart}
                            on:touchend={handleTouchEnd}
                            on:touchstart|passive
                            on:touchend|passive
                        >
                            <ArticleCard
                                {article}
                                index={index + visibleRange.start}
                                currentVisibleIndex={index + visibleRange.start}
                                active={isArticleVisible(
                                    index + visibleRange.start,
                                )}
                                score={article.score}
                                isRecommended={article.isRecommendation}
                                showNavigationButtons={false}
                                onNavigate={handleNavigate}
                                on:mounted={() => handleArticleView(article)}
                            />
                        </article>

                        {#if shouldShowAd(index + visibleRange.start)}
                            <aside
                                class="article-container snap-start absolute w-full"
                                style="transform: translateY({(index +
                                    visibleRange.start +
                                    1) *
                                    100}vh)"
                                aria-label="Advertisement"
                            >
                                <ProjectAd project={getRandomProjectAd()} />
                            </aside>
                        {/if}
                    {/each}
                </div>

                {#if articlesLoading && $articles.length === 0}
                    <div
                        class="absolute inset-0 flex items-center justify-center"
                        aria-live="assertive"
                    >
                        <LoadingSpinner
                            size="md"
                            message="Loading articles"
                            show={true}
                        />
                    </div>
                {/if}

                {#if loadingBatch}
                    <div
                        class="w-full flex justify-center py-4"
                        aria-live="polite"
                    >
                        <LoadingSpinner
                            size="sm"
                            message="Loading more articles"
                            show={true}
                        />
                    </div>
                {/if}
            </main>

            {#if $articleLoading.isLoading || $languageLoading.isLoading}
                <div
                    class="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center"
                >
                    <LoadingSpinner
                        size="md"
                        message={$languageLoading.isLoading
                            ? $languageLoading.message
                            : "Loading article"}
                        show={true}
                    />
                </div>
            {/if}
        </div>
    {/if}
</div>

{#if showOfflineMessage}
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-yellow-500/80 backdrop-blur-sm rounded-full text-black text-sm font-medium flex items-center gap-2" 
         transition:fade={{ duration: 200 }}>
        <WifiOff class="w-4 h-4" />
        You're offline - showing saved articles
        <button class="opacity-50 hover:opacity-100" on:click={() => showOfflineMessage = false}>
            <X class="w-4 h-4" />
        </button>
    </div>
{/if}

{#if showOnlineMessage}
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-green-500/80 backdrop-blur-sm rounded-full text-black text-sm font-medium flex items-center gap-2" 
         transition:fade={{ duration: 200 }}>
        <Wifi class="w-4 h-4" />
        You're back online - refreshing content
        <button class="opacity-50 hover:opacity-100" on:click={() => showOnlineMessage = false}>
            <X class="w-4 h-4" />
        </button>
    </div>
{/if}

{#if showRelatedArticles}
    <div class="fixed inset-0 z-[200] bg-black/80">
        <RelatedArticles
            isOpen={true}
            currentArticle={$articles[currentIndex]}
            onClose={() => (showRelatedArticles = false)}
            onArticleSelect={handleArticleSelect}
        />
    </div>
{/if}

{#if $articleBuffer.length > 0}
    <div
        class="fixed bottom-4 left-4 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white/90 text-sm"
        transition:fade
    >
        {$articleBuffer.length} articles ready
    </div>
{/if}

{#if isLoading}
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div
            class="bg-black/40 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2"
        >
            <div
                class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"
            ></div>
            <span class="text-white/90 text-sm">Loading more articles...</span>
        </div>
    </div>
{/if}
