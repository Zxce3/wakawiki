<script lang="ts">
    import { onMount, afterUpdate, onDestroy } from "svelte";
    import type {
        WikiArticle,
        FeedbackType,
        ArticleRecommendation,
    } from "$lib/types";
    import {
        recordInteraction,
        handleLike,
        likedArticles,
        type InteractionType,
    } from "$lib/store/articles";
    import FeedbackBar from "./FeedbackBar.svelte";
    import { fade } from "svelte/transition";
    import LoadingSpinner from "./LoadingSpinner.svelte";
    import { storeOfflineArticle } from "$lib/storage/utils";
    import ShareArticle from "./ShareArticle.svelte";
    import { Heart, Share2, ExternalLink, ArrowUp, ArrowDown, Wifi, WifiOff } from 'lucide-svelte';
    import { browser } from "$app/environment";
    export let article: WikiArticle;
    export let active = false;
    export let score: number | undefined = undefined;
    export let isRecommended = false;
    export let showNavigationButtons = true;
    export let onNavigate: ((direction: "up" | "down") => void) | undefined =
        undefined;
    // svelte-ignore export_let_unused
        export let recommendations: ArticleRecommendation[] = [];
    export const onRecommendationClick:
        | ((rec: ArticleRecommendation) => void)
        | undefined = undefined;
    export let recommendationsLoading = false;
    export let index: number;
    export let currentVisibleIndex: number;

    $: isLiked = $likedArticles.has(article.id);
    $: shouldLoadImage = index <= currentVisibleIndex + 1;
    $: isVisible = index === currentVisibleIndex;

    let imageElement: HTMLImageElement;
    let imageLoading = true;
    let containerElement: HTMLDivElement;
    let imageError = false;
    let hasRecordedView = false;

    let imageLoaded = false;
    let contentLoaded = false;
    let loadingError = false;

    const LOAD_TIMEOUT = 5000; // 5 seconds timeout for loading
    let loadTimeout: NodeJS.Timeout;
    let mounted = false;

    const IMAGE_LOAD_TIMEOUT = 3000;
    let imageAttempts = 0;
    const MAX_IMAGE_ATTEMPTS = 2;

    // Add new variable to track if image is SVG
    let isSVG = false;

    // Add touch event options

    // Add this function for gradient animation
    function getRandomGradient() {
        const gradients = [
            "from-blue-500/30 to-purple-500/30",
            "from-emerald-500/30 to-blue-500/30",
            "from-purple-500/30 to-pink-500/30",
            "from-pink-500/30 to-orange-500/30",
        ];
        return gradients[Math.floor(Math.random() * gradients.length)];
    }

    let lastTapTime = 0;
    const DOUBLE_TAP_DELAY = 300;

    function handleTap(event: TouchEvent) {
        const currentTime = Date.now();
        const tapLength = currentTime - lastTapTime;

        if (tapLength < DOUBLE_TAP_DELAY && tapLength > 0) {
            event.preventDefault();
            handleLikeClick();
        }
        lastTapTime = currentTime;
    }

    // Add offline state
    let isOffline = !navigator.onLine;

    let viewportStartTime = 0;
    let maxScrollDepth = 0;
    let readStartTime = 0;
    let contentHeight = 0;

    // Add new variables for fallback loading
    let showFallbackLoading = false;
    let loadingTimeout: NodeJS.Timeout;
    const FALLBACK_TIMEOUT = 2000; // Show fallback after 2 seconds

    // Add virtualization optimization
    let intersectionObserver: IntersectionObserver;
    let isIntersecting = false;

    onMount(() => {
        mounted = true;
        if (active) {
            loadContent();
            viewportStartTime = Date.now();
            readStartTime = Date.now();
            // Get content height for scroll depth calculation
            if (containerElement) {
                contentHeight = containerElement.scrollHeight;
            }
        }
        window.addEventListener("online", () => (isOffline = false));
        window.addEventListener("offline", () => (isOffline = true));

        // Store article for offline access
        if (article) {
            storeOfflineArticle(article).catch(console.error);
        }

        // Only observe intersection if browser supports it
        if (browser && 'IntersectionObserver' in window) {
            intersectionObserver = new IntersectionObserver(
                (entries) => {
                    const [entry] = entries;
                    isIntersecting = entry.isIntersecting;
                    
                    if (isIntersecting && !contentLoaded) {
                        loadContent();
                        if (active) {
                            handleArticleView(article);
                        }
                    }
                },
                {
                    rootMargin: '100% 0px',
                    threshold: 0
                }
            );

            if (containerElement) {
                intersectionObserver.observe(containerElement);
            }
        }

        return () => {
            clearTimeout(loadTimeout);
            clearTimeout(loadingTimeout);
            mounted = false;
            if (intersectionObserver) {
                intersectionObserver.disconnect();
            }
        };
    });

    onDestroy(() => {
        if (imageElement) {
            imageElement.src = "";
            imageElement.remove();
        }
        if (containerElement) {
            containerElement.innerHTML = "";
        }
    });

    async function loadContent() {
        if (!mounted) return;

        // Start fallback timer
        loadingTimeout = setTimeout(() => {
            if (!contentLoaded) {
                showFallbackLoading = true;
            }
        }, FALLBACK_TIMEOUT);

        loadTimeout = setTimeout(() => {
            if (!imageLoaded) {
                loadingError = true;
                imageLoading = false;
            }
        }, LOAD_TIMEOUT);

        if (shouldLoadImage && article.imageUrl) {
            loadImage();
        }

        if (active && !hasRecordedView) {
            hasRecordedView = true;
            recordInteraction(article, "view");
        }
    }

    let imageLoadingState: "idle" | "loading" | "loaded" | "error" = "idle";

    const loadImage = async () => {
        if (!article.imageUrl || imageLoaded || !mounted || !isVisible) return;

        imageLoadingState = "loading";
        const thumbnailUrl =
            article.thumbnail?.replace(/\/\d+px-/, "/300px-") ||
            article.imageUrl;

        try {
            if (isOffline) {
                // Try to load from cache first
                const cache = await caches.open("images-cache-v1");
                const response = await cache.match(thumbnailUrl);
                if (response) {
                    const blob = await response.blob();
                    article.imageUrl = URL.createObjectURL(blob);
                } else {
                    throw new Error("Image not in cache");
                }
            }

            const img = new Image();
            img.loading = "lazy";
            img.decoding = "async";

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = thumbnailUrl;
            });

            if (mounted) {
                imageLoaded = true;
                imageLoading = false;
                imageLoadingState = "loaded";
            }
        } catch (error) {
            if (mounted) {
                imageError = true;
                imageLoading = false;
                imageLoadingState = "error";
            }
        }
    };

    async function attemptImageLoad() {
        if (!article.imageUrl || imageLoaded || !mounted) return;

        imageAttempts++;
        imageLoading = true;

        try {
            const img = new Image();
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(
                    () => reject("timeout"),
                    IMAGE_LOAD_TIMEOUT,
                );

                img.onload = () => {
                    clearTimeout(timeout);
                    resolve(img);
                };

                img.onerror = () => {
                    clearTimeout(timeout);
                    reject("error");
                };

                img.src = article.imageUrl!;
            });

            if (mounted) {
                imageLoaded = true;
                imageLoading = false;
                imageError = false;
                requestAnimationFrame(() => updateImageLayout());
            }
        } catch (error) {
            if (mounted) {
                // Try thumbnail as fallback
                if (
                    article.thumbnail &&
                    article.imageUrl !== article.thumbnail
                ) {
                    article.imageUrl = article.thumbnail;
                    if (imageAttempts < MAX_IMAGE_ATTEMPTS) {
                        await attemptImageLoad();
                        return;
                    }
                }
                imageError = true;
                imageLoading = false;
            }
        }
    }

    $: if (isVisible && !contentLoaded && mounted) {
        showFallbackLoading = false;
        loadContent();
        contentLoaded = true;
    }

    $: if (isVisible && !imageLoaded && !imageError) {
        attemptImageLoad();
    }

    // Optimize image loading
    $: if (isIntersecting && !imageLoaded && !imageError && shouldLoadImage) {
        loadImage();
    }

    // Cleanup resources when article is not visible
    $: if (!isIntersecting && imageElement) {
        // Release image resources when out of view
        imageElement.src = '';
        imageLoaded = false;
        imageLoading = true;
    }

    function updateImageLayout() {
        // Add null checks and requestAnimationFrame wrapper
        if (!imageElement || !containerElement || !mounted) return;

        // Ensure DOM is ready
        requestAnimationFrame(() => {
            try {
                const img = imageElement;
                const container = containerElement;

                // Guard against null elements
                if (
                    !img ||
                    !container ||
                    !img.naturalWidth ||
                    !img.naturalHeight
                ) {
                    return;
                }

                const imgAspect = img.naturalWidth / img.naturalHeight;
                const containerAspect =
                    container.clientWidth / container.clientHeight;

                img.style.cssText = `
                    opacity: 1;
                    position: absolute;
                    transition: opacity 0.3s ease;
                    max-width: none;
                    max-height: none;
                `;

                if (imgAspect > containerAspect) {
                    img.style.width = "100%";
                    img.style.height = "auto";
                    img.style.top = "50%";
                    img.style.left = "0";
                    img.style.transform = "translateY(-50%)";
                } else {
                    img.style.height = "100%";
                    img.style.width = "auto";
                    img.style.left = "50%";
                    img.style.top = "0";
                    img.style.transform = "translateX(-50%)";
                }
            } catch (error) {
                console.warn("Error updating image layout:", error);
            }
        });
    }

    function handleImageLoad(event: Event) {
        if (!mounted) return;

        imageElement = event.target as HTMLImageElement;
        imageLoading = false;
        imageError = false;
        imageLoaded = true;
        imageLoadingState = "loaded";

        // Wait for next frame to ensure container is mounted
        requestAnimationFrame(() => {
            if (mounted && containerElement) {
                isSVG =
                    article.imageUrl?.toLowerCase().endsWith(".svg") ||
                    imageElement.src.includes("data:image/svg+xml");
                updateImageLayout();
            }
        });
    }

    function handleImageError() {
        imageError = true;
        imageLoading = false;
        imageLoadingState = "error";
    }

    let likeLoading = false;

    async function handleLikeClick() {
        if (likeLoading) return;

        likeLoading = true;
        try {
            await handleLike(article);
            isLiked = $likedArticles.has(article.id);
            handleArticleInteraction("like");
        } catch (error) {
            console.error("Error handling like:", error);
        } finally {
            likeLoading = false;
        }
    }

    function handleScroll(event: Event) {
        if (!active) return;
        const element = event.target as HTMLElement;
        const scrollDepth =
            (element.scrollTop + element.clientHeight) / element.scrollHeight;
        maxScrollDepth = Math.max(maxScrollDepth, scrollDepth);
    }

    function calculateReadPercentage(): number {
        const timeSpent = Date.now() - readStartTime;
        const estimatedWordsPerMinute = 200;
        const wordCount = article.content?.split(/\s+/).length || 0;
        const estimatedReadTime =
            (wordCount / estimatedWordsPerMinute) * 60 * 1000;
        return Math.min(100, (timeSpent / estimatedReadTime) * 100);
    }

    function handleArticleInteraction(type: InteractionType) {
        const timeSpent = Date.now() - viewportStartTime;
        recordInteraction(article, type, {
            timeSpent,
            scrollDepth: maxScrollDepth,
            viewportTime: active ? Date.now() - viewportStartTime : 0,
            readPercentage: calculateReadPercentage(),
        });
    }

    let showShareModal = false;

    function handleShareClick() {
        if (navigator.share) {
            navigator
                .share({
                    title: article.title,
                    url: article.url,
                })
                .then(() => {
                    handleArticleInteraction("share");
                });
        } else {
            showShareModal = true;
        }
    }

    let showFullCaption = false;
    function toggleCaption() {
        showFullCaption = !showFullCaption;
    }

    function handleFeedback(
        event: CustomEvent<{ type: FeedbackType; article: WikiArticle }>,
    ) {
        const { type, article } = event.detail;
        if (type === "more_like_this") {
            recordInteraction(article, "like");
        }
    }

    // Update the view recording
    $: if (isVisible && !hasRecordedView) {
        hasRecordedView = true;
        handleArticleInteraction("view");
    }


    function handleArticleView(article: WikiArticle) {
        throw new Error("Function not implemented.");
    }
</script>

<div
    bind:this={containerElement}
    class="article-card h-full w-full flex items-center justify-center relative overflow-hidden"
    class:active
    class:visible={isIntersecting}
    on:touchend={handleTap}
    on:scroll={handleScroll}
>
    {#if !contentLoaded || showFallbackLoading}
        <div
            class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4"
        >
            <LoadingSpinner size="md" show={true} fullscreen={false} />
            {#if showFallbackLoading}
                <div class="text-white/70 text-sm text-center px-4">
                    <p>Still loading...</p>
                    <p class="text-xs mt-1">
                        Pull down to refresh if content doesn't appear
                    </p>
                </div>
            {/if}
        </div>
    {/if}

    <div
        class="absolute inset-0 bg-gradient-to-b from-neutral-800/80 to-neutral-900/60"
    ></div>

    <div class="absolute inset-0">
        {#if article.imageUrl && !imageError}
            <div class="relative w-full h-full">
                {#if imageLoadingState === "loading"}
                    <div
                        class="absolute inset-0 bg-neutral-800 animate-pulse flex items-center justify-center"
                        transition:fade={{ duration: 200 }}
                    >
                        <LoadingSpinner
                            size="sm"
                            show={true}
                            fullscreen={false}
                            message="Loading image"
                        />
                    </div>
                {/if}

                {#if isSVG}
                    <div
                        class="absolute inset-0 bg-gradient-to-b from-neutral-60 to-neutral-700 transition-opacity duration-300"
                        class:opacity-50={imageLoaded}
                        class:opacity-100={!imageLoaded}
                    ></div>
                {:else}
                    <div
                        class="absolute inset-0 bg-gradient-to-b from-black-60 to-black-70 transition-opacity duration-300"
                        class:opacity-50={imageLoaded}
                        class:opacity-100={!imageLoaded}
                    ></div>
                {/if}

                <img
                    src={article.imageUrl}
                    alt={article.title}
                    class="w-full h-full object-contain transition-all duration-500"
                    class:opacity-0={!imageLoaded ||
                        imageLoadingState === "loading"}
                    class:opacity-100={imageLoaded &&
                        imageLoadingState === "loaded"}
                    class:scale-[1.02]={!imageLoaded}
                    class:scale-100={imageLoaded}
                    loading={isVisible ? "eager" : "lazy"}
                    decoding="async"
                    fetchpriority={isVisible ? "high" : "low"}
                    on:load={handleImageLoad}
                    on:error={handleImageError}
                />

                <div
                    class="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50 pointer-events-none"
                ></div>
            </div>
        {:else}
            <div
                class="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center overflow-hidden"
            >
                <div class="relative w-full h-full">
                    <div
                        class="absolute inset-0 flex items-center justify-center"
                    >
                        <div class="relative">
                            <div class="flex flex-col items-center gap-4">
                                <span
                                    class="text-[20vw] md:text-[15vw] font-bold text-white opacity-10 transform-gpu animate-pulse select-none"
                                >
                                    W
                                </span>
                                <span class="text-white/50 text-sm"
                                    >No Image</span
                                >
                            </div>

                            <svg
                                class="absolute inset-0 w-full h-full -translate-y-1/2 top-1/2"
                                viewBox="0 0 100 100"
                            >
                                <defs>
                                    <linearGradient
                                        id="ringGradient"
                                        x1="0%"
                                        y1="0%"
                                        x2="100%"
                                        y2="0%"
                                    >
                                        <stop
                                            offset="0%"
                                            style="stop-color:#ffffff;stop-opacity:0.1"
                                        />
                                        <stop
                                            offset="50%"
                                            style="stop-color:#ffffff;stop-opacity:0.3"
                                        />
                                        <stop
                                            offset="100%"
                                            style="stop-color:#ffffff;stop-opacity:0.1"
                                        />
                                    </linearGradient>
                                </defs>

                                <circle
                                    cx="50"
                                    cy="50"
                                    r="45"
                                    fill="none"
                                    stroke="url(#ringGradient)"
                                    stroke-width="0.5"
                                    class="animate-spin-slow"
                                    style="transform-origin: center; animation-duration: 15s;"
                                />

                                <circle
                                    cx="50"
                                    cy="50"
                                    r="35"
                                    fill="none"
                                    stroke="url(#ringGradient)"
                                    stroke-width="0.5"
                                    class="animate-spin-slow"
                                    style="transform-origin: center; animation-duration: 10s; animation-direction: reverse;"
                                />
                            </svg>
                        </div>
                    </div>

                    <div
                        class="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50 pointer-events-none"
                    ></div>
                </div>
            </div>
        {/if}
    </div>

    <div class="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-6">
        {#if isRecommended && score}
            <div class="mb-3">
                <span
                    class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-white/10 backdrop-blur-sm text-white transition-all hover:bg-white/15"
                    in:fade={{ duration: 200 }}
                >
                    {#if score > 0.8}
                        <span class="text-yellow-400">⭐</span>
                        <span>Highly Recommended</span>
                    {:else if score > 0.6}
                        <span class="text-blue-400">📚</span>
                        <span>Similar Content</span>
                    {:else}
                        <span class="text-emerald-400">💡</span>
                        <span>You Might Like</span>
                    {/if}
                </span>
            </div>
        {/if}

        <div class="relative rounded-xl bg-black/30">
            <div
                class="relative max-w-[85%] @lg:max-w-[75%] space-y-3 @md:space-y-4 p-4 @md:p-5"
            >
                <h2
                    class="text-lg @sm:text-xl @md:text-2xl @lg:text-3xl font-bold text-white/95 drop-shadow-sm"
                >
                    {article.title}
                </h2>
                <div class="space-y-2">
                    <div
                        class="relative max-h-[150px] overflow-y-auto custom-scrollbar"
                        class:max-h-none={!showFullCaption}
                    >
                        <button
                            type="button"
                            class="text-sm @md:text-base text-white/90 leading-relaxed cursor-pointer drop-shadow-sm pr-2 text-left w-full"
                            class:line-clamp-2={!showFullCaption}
                            on:click={toggleCaption}
                            on:keydown={(e) =>
                                e.key === "Enter" && toggleCaption()}
                        >
                            {article.excerpt}
                        </button>
                    </div>
                    {#if (article.excerpt ?? "").length > 200}
                        <button
                            class="text-xs @md:text-sm text-white/75 hover:text-white transition-colors font-medium mt-2"
                            on:click={toggleCaption}
                        >
                            {showFullCaption ? "Show less ↑" : "Read more ↓"}
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <div
        class="absolute right-4 @md:right-6 @lg:right-8 bottom-6 @md:bottom-8 flex flex-col items-center gap-4 z-40"
    >
        <button
            class="flex flex-col items-center group"
            class:text-red-500={isLiked}
            class:text-white={!isLiked}
            class:opacity-50={likeLoading}
            on:click={handleLikeClick}
            disabled={likeLoading}
            aria-label={isLiked ? "Unlike" : "Like"}
        >
            <div
                class="p-3 @md:p-4 rounded-full bg-black/40 hover:bg-black/60 transition-all active:scale-95 group-hover:scale-105"
            >
                {#if likeLoading}
                    <div
                        class="w-6 h-6 @md:w-8 @md:h-8 animate-spin border-2 border-current border-t-transparent rounded-full"
                    ></div>
                {:else}
                    <Heart class="w-6 h-6 @md:w-8 @md:h-8" fill={isLiked ? "currentColor" : "none"} />
                {/if}
            </div>
            <span class="text-xs @md:text-sm mt-1 font-medium text-white/90">
                {isLiked ? "Liked" : "Like"}
            </span>
        </button>

        <a
            href={isOffline ? undefined : article.url}
            class="flex flex-col items-center group"
            class:pointer-events-none={isOffline}
            aria-label={isOffline ? "Not available offline" : "Read article"}
            title={isOffline ? "Not available offline" : "Read article"}
            target="_blank"
            rel="noopener noreferrer"
        >
            <div
                class="p-3 @md:p-4 rounded-full bg-black/40 hover:bg-black/60 transition-all active:scale-95 group-hover:scale-105"
                class:opacity-50={isOffline}
            >
                {#if isOffline}
                    <WifiOff class="w-6 h-6 @md:w-8 @md:h-8 text-white" />
                {:else}
                    <ExternalLink class="w-6 h-6 @md:w-8 @md:h-8 text-white" />
                {/if}
            </div>
            <span class="text-xs @md:text-sm mt-1 font-medium text-white/90">
                {isOffline ? "Offline" : "Read"}
            </span>
        </a>

        <button
            class="flex flex-col items-center group"
            on:click={handleShareClick}
            aria-label="Share"
        >
            <div
                class="p-3 rounded-full bg-black/40 hover:bg-black/60 transition-all"
            >
                <Share2 class="w-6 h-6 text-white" />
            </div>
            <span class="text-xs mt-1 font-medium text-white/90">Share</span>
        </button>
    </div>

    {#if showNavigationButtons && onNavigate}
        <div
            class="absolute right-4 top-1/2 -translate-y-1/2 z-[50] hidden md:flex flex-col gap-4"
        >
            <button
                class="p-3 rounded-full bg-black/40 hover:bg-black/60 transition-colors group"
                on:click={() => onNavigate("up")}
                aria-label="Navigate up"
            >
                <ArrowUp class="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
            </button>
            <button
                class="p-3 rounded-full bg-black/40 hover:bg-black/60 transition-colors group"
                on:click={() => onNavigate("down")}
                aria-label="Navigate down"
            >
                <ArrowDown class="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
            </button>
        </div>
    {/if}

    {#if active && isRecommended && score && score > 0.5}
        <FeedbackBar
            {article}
            {score}
            onFeedback={(type) =>
                handleFeedback(
                    new CustomEvent("feedback", { detail: { type, article } }),
                )}
        />
    {/if}

    {#if recommendationsLoading}
        <div
            class="absolute bottom-4 right-4 z-50 bg-black/40 backdrop-blur rounded-full"
        >
            <LoadingSpinner
                size="sm"
                show={true}
                fullscreen={false}
                position="center"
            />
        </div>
    {/if}
</div>

<ShareArticle
    {article}
    isOpen={showShareModal}
    onClose={() => (showShareModal = false)}
/>

<style>
    @keyframes gradient {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    .animate-spin-slow {
        animation: spin 20s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
    img {
        backface-visibility: hidden;
        transform: translateZ(0);
        will-change: opacity, transform;
    }

    .article-card {
        will-change: transform;
        contain: content;
    }

    .article-card:not(.visible) {
        visibility: hidden;
    }
</style>
