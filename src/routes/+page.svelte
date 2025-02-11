<script lang="ts">
    export let data;
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import {
        articles,
        loadMoreArticles,
        loading,
        likedArticles,
        loadingMore,
        recommendations,
        articleBuffer,
    } from "$lib/store/articles";
    import { language } from "$lib/store/language";
    $: typedLanguage = $language as SupportedLanguage;
    import ArticleCard from "$lib/components/ArticleCard.svelte";
    import LanguageSelector from "$lib/components/LanguageSelector.svelte";
    import LikedArticles from "$lib/components/LikedArticles.svelte";
    import type { SupportedLanguage, WikiArticle } from "$lib/types";
    import { articleLoading } from "$lib/store/loading";
    import type { ArticleRecommendation } from "$lib/types";
    import { getRandomProjectAd } from "$lib/config/projects";
    import ProjectAd from "$lib/components/ProjectAd.svelte";
    import wiki from "wikipedia";
    import { languageLoading, setLoading } from "$lib/store/loading";
    import LoadingSpinner from "$lib/components/LoadingSpinner.svelte";
    import { fade } from "svelte/transition";
    import { checkScrollPosition } from "$lib/store/articles";
    import { fetchRandomArticle } from "$lib/api/wikipedia";
    import { getBrowserLanguage, getStoredLanguage } from "$lib/storage/utils";
    import { error } from "@sveltejs/kit";

    const INITIAL_ARTICLES_COUNT = 6;

    async function loadInitialData() {
        try {
            const storedLanguage = await getStoredLanguage();
            const initialLanguage =
                storedLanguage || (getBrowserLanguage() as SupportedLanguage);
            const articles: WikiArticle[] = [];

            for (let i = 0; i < INITIAL_ARTICLES_COUNT; i++) {
                try {
                    const article = await fetchRandomArticle(initialLanguage);
                    if (article) {
                        articles.push(article);
                    }
                } catch (err) {
                    console.warn(`Failed to load article ${i + 1}:`, err);
                }
            }

            if (articles.length === 0) {
                throw error(500, "Failed to load initial articles");
            }

            return {
                initialLanguage,
                initialArticles: articles,
            };
        } catch (err) {
            console.error("Error loading page:", err);
            throw error(500, "Failed to load page data");
        }
    }

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

    const languages: Record<SupportedLanguage, string> = {
        en: "🇬🇧",
        es: "🇪🇸",
        fr: "🇫🇷",
        de: "🇩🇪",
        zh: "🇨🇳",
        ja: "🇯🇵",
        ko: "🇰🇷",
        ru: "🇷🇺",
        it: "🇮🇹",
        pt: "🇵🇹",
        ar: "🇸🇦",
        hi: "🇮🇳",
        nl: "🇳🇱",
        pl: "🇵🇱",
        id: "🇮🇩",
    };

    let currentIndex = 0;
    let container: HTMLElement;
    let showLikedArticles = false;
    let showLanguageSelector = false;

    let touchStart = 0;
    let touchEnd = 0;
    let lastVisibleIndex = 0;

    let articlesContainer: HTMLElement;
    let lastScrollPosition = 0;
    const SCROLL_THRESHOLD = 0.8;

    let articlesLoading = false;
    let isPortrait = true;
    let viewportHeight = 0;

    if (browser) {
        window.recommendationsWorker?.addEventListener("message", (event) => {
            const newRecs: ArticleRecommendation[] = event.data;
            recommendations.set(
                new Map(newRecs.map((rec) => [rec.articleId, rec.score])),
            );
        });
    }

    function handleTouchStart(e: TouchEvent) {
        touchStart = e.changedTouches[0].screenY;
    }

    function handleTouchEnd(e: TouchEvent) {
        touchEnd = e.changedTouches[0].screenY;
        const diff = touchStart - touchEnd;

        if (Math.abs(diff) > 50) {
            if (diff > 0 && currentIndex < $articles.length - 1) {
                currentIndex++;
            } else if (diff < 0 && currentIndex > 0) {
                currentIndex--;
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

        const articles =
            articlesContainer.querySelectorAll(".article-container");
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

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            scrollToArticle("up");
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            scrollToArticle("down");
        }
    }

    function handleRecommendationMessage(event: MessageEvent) {
        if (Array.isArray(event.data)) {
            const newMap = new Map(
                event.data.map((rec: ArticleRecommendation) => [
                    rec.articleId,
                    rec.score,
                ]),
            );
            recommendations.set(newMap);
            console.log("Received recommendations:", newMap);
        }
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
    let lastLoadTime = 0;
    const LOAD_COOLDOWN = 250;
    const INITIAL_BATCH_SIZE = 5;
    const SCROLL_BATCH_SIZE = 3;

    async function loadArticles() {
        if (!browser || isLoading || $loadingMore) return;

        const now = Date.now();
        if (now - lastLoadTime < LOAD_COOLDOWN) return;

        isLoading = true;
        $loadingMore = true;

        try {
            const batchSize =
                $articles.length === 0 ? INITIAL_BATCH_SIZE : SCROLL_BATCH_SIZE;
            await loadMoreArticles(batchSize);
            lastLoadTime = Date.now();
        } catch (error) {
            console.error("Error loading articles:", error);
        } finally {
            isLoading = false;
            $loadingMore = false;
        }
    }

    function checkOrientation() {
        isPortrait = window.innerHeight > window.innerWidth;
    }

    let contentReady = false;
    let initialLoadComplete = false;

    const INITIAL_LOAD_TIMEOUT = 3000;
    const SCROLL_DEBOUNCE = 150;
    const LOAD_BATCH_SIZE = 3;
    let initialLoadTimer: NodeJS.Timeout;
    let scrollDebounceTimer: NodeJS.Timeout;
    let loadingBatch = false;

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

    function handleScroll(e: Event) {
        if (loadingBatch) return;

        const container = e.target as HTMLElement;
        const { scrollTop, clientHeight, scrollHeight } = container;

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
    $: isContentLoading =
        $articleLoading.isLoading ||
        $languageLoading.isLoading ||
        (!initialLoadComplete && !contentReady);

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

    async function handleRecommendationClick(article: WikiArticle) {
        if (!article.title) return;

        setLoading("article", true, "Loading article");

        try {
            articles.update((existing) => [article, ...existing]);
            currentIndex = 0;
        } catch (error) {
            console.error("Error loading article:", error);
        } finally {
            setLoading("article", false);
        }
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

    const onClose = () => {
        showLanguageSelector = false;
        setLoading("language", false);
    };

    const onSelect = async (newLang: SupportedLanguage) => {
        setLoading("language", true, `Changing to ${languages[newLang]}`);
        await handleLanguageChange();
        showLanguageSelector = false;
    };

    function handleArticleSelect(article: WikiArticle) {
        showLikedArticles = false;
        setLoading("article", true, "Loading selected article");
        handleArticleChange(article);
    }

    function isArticleVisible(index: number): boolean {
        return index === lastVisibleIndex;
    }

    let scrollTimeout: NodeJS.Timeout;

    onMount(() => {
        if (browser) {
            if ($articles.length === 0) {
                loadArticleBatch(5);
            }
        }
    });

    let lastTapTime = 0;
    const DOUBLE_TAP_DELAY = 300; // milliseconds

    function handleTap(article: WikiArticle) {
        const currentTime = Date.now();
        const tapLength = currentTime - lastTapTime;
        
        if (tapLength < DOUBLE_TAP_DELAY && tapLength > 0) {
            // Double tap detected
            likedArticles.update(set => {
                const newSet = new Set(set);
                if (newSet.has(article.id)) {
                    newSet.delete(article.id);
                } else {
                    newSet.add(article.id);
                }
                return newSet;
            });
        }
        lastTapTime = currentTime;
    }
</script>

<!-- Main container with loading states -->
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
            <!-- Navigation Controls -->
            <nav
                class="fixed top-0 inset-x-0 z-50 flex justify-between items-center p-4 max-w-[500px] mx-auto"
                aria-label="Main navigation"
            >
                <button
                    class="p-3 rounded-full bg-black/40 backdrop-blur transition-colors hover:bg-black/60"
                    on:click={() => (showLanguageSelector = true)}
                    aria-label="Select Language"
                >
                    <span class="text-2xl"
                        >{languages[$language as SupportedLanguage]}</span
                    >
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
                        <span class="text-white font-medium"
                            >{$likedArticles.size}</span
                        >
                    </div>
                </button>
            </nav>

            <!-- Desktop Navigation Buttons -->
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
                    <!-- Fixed viewBox attribute here -->
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

            <!-- Articles Container -->
            <main
                class="h-full w-full overflow-y-auto snap-y snap-mandatory scrollbar-none"
                bind:this={articlesContainer}
                on:scroll={handleScroll}
                role="feed"
                aria-busy={loadingBatch}
                aria-label="Articles feed"
            >
                <!-- Initial Loading State -->
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

                {#each $articles as article, index (article.id + "-" + index)}
                    <article class="article-container snap-start" on:touchend={() => handleTap(article)}>
                        <ArticleCard
                            {article}
                            {index}
                            currentVisibleIndex={lastVisibleIndex}
                            active={isArticleVisible(index)}
                            score={article.score}
                            isRecommended={article.isRecommendation}
                            showNavigationButtons={false}
                            onNavigate={handleNavigate}
                            on:mounted={() => handleArticleView(article)}
                        />
                    </article>

                    <!-- Insert project ad -->
                    {#if shouldShowAd(index)}
                        <aside
                            class="article-container snap-start"
                            aria-label="Advertisement"
                        >
                            <ProjectAd project={getRandomProjectAd()} />
                        </aside>
                    {/if}
                {/each}

                <!-- Loading More Indicator -->
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

            <!-- Loading overlays -->
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

<!-- Modals -->
{#if showLanguageSelector || showLikedArticles}
    <div class="fixed inset-0 z-[200] bg-black/80">
        {#if showLanguageSelector}
            <LanguageSelector isOpen={true} {onClose} {onSelect} />
        {:else if showLikedArticles}
            <LikedArticles
                isOpen={true}
                articles={$articles}
                onClose={() => (showLikedArticles = false)}
                onArticleSelect={handleArticleSelect}
            />
        {/if}
    </div>
{/if}

<!-- Add buffer status indicator -->
{#if $articleBuffer.length > 0}
    <div
        class="fixed bottom-4 left-4 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white/90 text-sm"
        transition:fade
    >
        {$articleBuffer.length} articles ready
    </div>
{/if}

<!-- Add loading indicator -->
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
