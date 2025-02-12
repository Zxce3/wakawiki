<script lang="ts">
    import { onMount, afterUpdate } from "svelte";
    import type {
        WikiArticle,
        FeedbackType,
        ArticleRecommendation,
        SupportedLanguage,
    } from "../types";
    import {
        recordInteraction,
        handleLike,
        likedArticles,
    } from "../store/articles";
    import FeedbackBar from "./FeedbackBar.svelte";
    import LoadingSpinner from "./LoadingSpinner.svelte";
    import { fetchArticleImages } from "../api/wikipedia";
    import { fade } from "svelte/transition";
    export let article: WikiArticle;
    export let active = false;
    export let score: number | undefined = undefined;
    export let isRecommended = false;
    export let showNavigationButtons = true;
    export let onNavigate: ((direction: "up" | "down") => void) | undefined =
        undefined;
    export let recommendations: ArticleRecommendation[] = [];
    export const onRecommendationClick:
        | ((rec: ArticleRecommendation) => void)
        | undefined = undefined;
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

    const LOAD_TIMEOUT = 5000; // 5 seconds timeout for loading
    let loadTimeout: NodeJS.Timeout;
    let mounted = false;

    const IMAGE_LOAD_TIMEOUT = 3000;
    let imageAttempts = 0;
    const MAX_IMAGE_ATTEMPTS = 2;

    // Add new variable to track if image is SVG
    let isSVG = false;

    // Add touch event options
    const touchEventOptions = { passive: true };

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

    let fallbackGradient = getRandomGradient();

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

    onMount(() => {
        mounted = true;
        if (active) {
            loadContent();
        }
        return () => {
            clearTimeout(loadTimeout);
            mounted = false;
        };
    });

    async function loadContent() {
        if (!mounted) return;

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

    const loadImage = async () => {
        if (!article.imageUrl || imageLoaded || !mounted) return;

        const img = new Image();
        const loadPromise = new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        img.src = article.imageUrl;

        try {
            await Promise.race([
                loadPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject("timeout"), LOAD_TIMEOUT),
                ),
            ]);
            if (mounted) {
                imageLoaded = true;
                imageLoading = false;
            }
        } catch (error) {
            if (mounted) {
                loadingError = true;
                imageLoading = false;
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
        loadContent();
        contentLoaded = true;
    }

    $: if (isVisible && !imageLoaded && !imageError) {
        attemptImageLoad();
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
                if (!img || !container || !img.naturalWidth || !img.naturalHeight) {
                    return;
                }

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
                } else {
                    img.style.height = '100%';
                    img.style.width = 'auto';
                    img.style.left = '50%';
                    img.style.top = '0';
                    img.style.transform = 'translateX(-50%)';
                }
            } catch (error) {
                console.warn('Error updating image layout:', error);
            }
        });
    }

    function handleImageLoad(event: Event) {
        if (!mounted) return;
        
        imageElement = event.target as HTMLImageElement;
        imageLoading = false;
        imageError = false;
        
        // Wait for next frame to ensure container is mounted
        requestAnimationFrame(() => {
            if (mounted && containerElement) {
                isSVG = article.imageUrl?.toLowerCase().endsWith('.svg') || 
                        imageElement.src.includes('data:image/svg+xml');
                updateImageLayout();
            }
        });
    }

    afterUpdate(() => {
        if (mounted && imageElement && containerElement) {
            updateImageLayout();
        }
    });

    function handleImageError() {
        imageError = true;
        imageLoading = false;
    }

    function handleLikeClick() {
        handleLike(article).then(() => {
            isLiked = $likedArticles.has(article.id);
        });
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
</script>

<div
    bind:this={containerElement}
    class="article-card h-full w-full flex items-center justify-center relative overflow-hidden"
    class:active
    on:touchstart|passive
    on:touchend={handleTap}
>
    <div
        class="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none select-none hidden md:flex items-center gap-2"
        style="writing-mode: vertical-rl; text-orientation: mixed;"
    >
        <span class="text-sm">Swipe left for related articles</span>
        <svg
            class="w-4 h-4 rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
            />
        </svg>
    </div>

    {#if !contentLoaded}
        <div
            class="absolute inset-0 bg-black/80 flex items-center justify-center"
        >
            <div
                class="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"
            ></div>
        </div>
    {/if}

    <div
        class="absolute inset-0 bg-gradient-to-b from-neutral-800/80 to-neutral-900/60"
    ></div>

    <div class="absolute inset-0">
        {#if article.imageUrl && !imageError}
            <div class="relative w-full h-full">
                {#if imageLoading}
                    <div
                        class="absolute inset-0 bg-neutral-800 animate-pulse"
                    ></div>
                {/if}

                {#if isSVG}
                    <div
                        class="absolute inset-0 bg-gradient-to-b from-neutral-60 to-neutral-700"
                    ></div>
                {:else}
                    <div
                        class="absolute inset-0 bg-gradient-to-b from-black-60 to-black-70"
                    ></div>
                {/if}

                <img
                    src={article.imageUrl}
                    alt={article.title}
                    class="w-full h-full object-contain transition-opacity duration-300"
                    class:opacity-0={imageLoading || !imageLoaded}
                    class:opacity-100={imageLoaded && !imageLoading}
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
            on:click={handleLikeClick}
            aria-label={isLiked ? "Unlike" : "Like"}
        >
            <div
                class="p-3 @md:p-4 rounded-full bg-black/40 hover:bg-black/60 transition-all active:scale-95 group-hover:scale-105"
            >
                <svg
                    class="w-6 h-6 @md:w-8 @md:h-8"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 
                             2 5.42 4.42 3 7.5 3
                             c1.74 0 3.41.81 4.5 2.09
                             C13.09 3.81 14.76 3
                             16.5 3 19.58 3 22 5.42
                             22 8.5c0 3.78-3.4 6.86-8.55 11.54
                             L12 21.35z"
                    />
                </svg>
            </div>
            <span class="text-xs @md:text-sm mt-1 font-medium text-white/90">
                {isLiked ? "Liked" : "Like"}
            </span>
        </button>

        <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            class="flex flex-col items-center group"
            aria-label="Read article"
        >
            <div
                class="p-3 @md:p-4 rounded-full bg-black/40 hover:bg-black/60 transition-all active:scale-95 group-hover:scale-105"
            >
                <svg
                    class="w-6 h-6 @md:w-8 @md:h-8 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10
                           a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                </svg>
            </div>
            <span class="text-xs @md:text-sm mt-1 font-medium text-white/90"
                >Read</span
            >
        </a>
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
                on:click={() => onNavigate("down")}
                aria-label="Navigate down"
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
            class="absolute bottom-4 right-4 z-50 bg-black/40 backdrop-blur rounded-full p-3"
        >
            <div
                class="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"
            ></div>
        </div>
    {/if}
</div>

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
</style>
