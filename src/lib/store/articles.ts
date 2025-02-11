/**
 * Articles Store
 * 
 * This module provides Svelte stores to manage articles, including loading, liking, and recommendations.
 * It handles interactions with web workers for prefetching and loading articles.
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { language } from './language';
import { fetchRandomArticle } from '../api/wikipedia';
import { storeInteraction, storeLikedArticle, removeLikedArticle, getLikedArticlesData } from '../storage/utils';
import type { WikiArticle, SupportedLanguage, ArticleRecommendation } from '../types';

declare module '../types' {
    interface WikiArticle {
        isRecommendation?: boolean;
        score?: number;
    }
}
import { articleLoading } from './loading';
import wiki from 'wikipedia';

declare global {
    interface Window {
        recommendationsWorker: Worker;
        articleLoaderWorker: Worker;
    }
}

let articleLoaderWorker: Worker | undefined;

if (browser) {
    try {
        articleLoaderWorker = new Worker(
            new URL('../workers/articleLoader.ts', import.meta.url),
            { type: 'module' }
        );

        articleLoaderWorker.onmessage = (event) => {
            const { type, articles: newArticles, error, count } = event.data;
            
            switch (type) {
                case 'articles':
                    if (Array.isArray(newArticles) && newArticles.length > 0) {
                        articles.update(existing => [...existing, ...newArticles]);
                        loadingMore.set(false);
                        
                        articleLoaderWorker?.postMessage({
                            type: 'prefetch',
                            language: get(language)
                        });
                    }
                    break;
                
                case 'bufferStatus':
                    articleBuffer.set(count);
                    break;
                    
                case 'error':
                    console.error('Article loader error:', error);
                    loadingMore.set(false);
                    break;
            }
        };
    } catch (error) {
        console.error('Failed to initialize article loader worker:', error);
    }
}

const loadingState = {
    isLoading: false,
    lastLoadTime: 0,
    retryCount: 0,
    maxRetries: 3,
    batchSize: 5
};

export const articles = writable<WikiArticle[]>([]);
export const loading = writable(false);
export const likedArticles = writable<Set<string>>(new Set());
export const loadingMore = writable(false);
export const isLoadingBuffer = writable(false);
export const articleBuffer = writable<WikiArticle[]>([]);
export const preloadingArticles = writable<Promise<WikiArticle>[]>([]);
export const loadingStatus = writable({
    isLoading: false,
    preloading: false,
    error: null as string | null
});
export const recommendations = writable(new Map<string, number>());
export const likedCategories = writable<Set<string>>(new Set());

/**
 * Derived store to combine all articles and buffer.
 */
export const allArticles = derived(
    [articles, articleBuffer],
    ([$articles, $buffer]) => [...$articles, ...$buffer]
);

export type InteractionType = 'view' | 'like';

/**
 * Records an interaction with an article.
 */
export function recordInteraction(article: WikiArticle, type: InteractionType): void {
    const interaction = {
        articleId: article.id,
        type,
        timestamp: Date.now(),
        language: article.language
    };

    if (browser && window.recommendationsWorker) {
        window.recommendationsWorker.postMessage([interaction]);
    }

    storeInteraction(interaction);
}

if (browser) {
    getLikedArticlesData().then(articles => {
        const likedIds = new Set(articles.map(a => a.id));
        likedArticles.set(likedIds);
    });
}

if (browser) {
    getLikedArticlesData().then(articles => {
        const categories = new Set<string>();
        articles.forEach(article => {
            article.categories?.forEach(cat => categories.add(cat));
        });
        likedCategories.set(categories);
        
        if (categories.size > 0 && window.recommendationsWorker) {
            window.recommendationsWorker.postMessage({
                type: 'initialize',
                categories: Array.from(categories),
                language: get(language)
            });
        }
    });
}

if (browser) {
    window.recommendationsWorker?.addEventListener('message', (event) => {
        const newRecs: ArticleRecommendation[] = event.data;
        recommendations.set(new Map(newRecs.map(rec => [rec.articleId, rec.score])));
    });
}

/**
 * Handles liking or unliking an article.
 */
export async function handleLike(article: WikiArticle): Promise<void> {
    likedArticles.update(likes => {
        const newLikes = new Set(likes);
        if (newLikes.has(article.id)) {
            newLikes.delete(article.id);
            removeLikedArticle(article.id);
            
            if (article.categories) {
                likedCategories.update(cats => {
                    const newCats = new Set(cats);
                    article.categories?.forEach(cat => newCats.delete(cat));
                    return newCats;
                });
            }
        } else {
            newLikes.add(article.id);
            storeLikedArticle(article);
            
            if (article.categories) {
                likedCategories.update(cats => {
                    const newCats = new Set(cats);
                    article.categories?.forEach(cat => newCats.add(cat));
                    return newCats;
                });
            }
        }
        return newLikes;
    });
}

const BUFFER_THRESHOLD = 5; 
const BATCH_SIZE = 5; 
const MINIMUM_EXCERPT_LENGTH = 100;
const DIVERSITY_WINDOW = 5; 
const LOAD_THRESHOLD = 6; 
const MAX_RETRIES = 3; 
const PARALLEL_LOADS = 6; 
const PRELOAD_THRESHOLD = 5; 
const BUFFER_SIZE = 10; 
const SCROLL_THROTTLE = 150; 
const RECOMMENDATION_INTERVAL = 3; 

/**
 * Determines if a recommendation should be inserted at a given index.
 */
export function shouldInsertRecommendation(index: number): boolean {
    return index > 0 && index % RECOMMENDATION_INTERVAL === 0;
}

const RECOMMENDATION_BATCH_SIZE = 2; 
const MIN_EXCERPT_LENGTH = 100;
const MIN_TITLE_LENGTH = 3;
const REQUIRED_FIELDS: (keyof WikiArticle)[] = ['id', 'title', 'excerpt', 'url'];

/**
 * Validates if an article is suitable for recommendations.
 */
function isValidRecommendation(article: WikiArticle): boolean {
    if (!REQUIRED_FIELDS.every((field: keyof WikiArticle) => article[field])) return false;
    if (!article.excerpt || article.excerpt.length < MIN_EXCERPT_LENGTH) return false;
    if (!article.title || article.title.length < MIN_TITLE_LENGTH) return false;
    if (article.title.toLowerCase().includes('stub') || 
        article.title.toLowerCase().startsWith('list of')) return false;
    if (!article.imageUrl && !article.thumbnail) return false;

    return true;
}

/**
 * Inserts recommendations into the articles list.
 */
async function insertRecommendation(articles: WikiArticle[], recommendations: Map<string, number>): Promise<WikiArticle[]> {
    const result: WikiArticle[] = [];
    const recommendationEntries = Array.from(recommendations.entries())
        .sort(([, a], [, b]) => b - a); 

    let recommendationIndex = 0;
    
    for (let i = 0; i < articles.length; i++) {
        result.push(articles[i]);
        
        if ((i + 1) % 3 === 0 && recommendationIndex < recommendationEntries.length) {
            const [recId, score] = recommendationEntries[recommendationIndex];
            try {
                const page = await wiki.page(recId);
                const [summary, categories] = await Promise.all([
                    page.summary(),
                    page.categories()
                ]);
                
                const recommendedArticle = {
                    id: String(summary.pageid),
                    title: summary.title,
                    excerpt: summary.extract || '',
                    imageUrl: summary.thumbnail?.source,
                    thumbnail: summary.thumbnail?.source,
                    language: get(language) as string,
                    url: summary.content_urls?.desktop?.page,
                    content: summary.extract || '',
                    categories,
                    lastModified: Date.now().toString(),
                    isRecommendation: true,
                    score: score,
                    imagePending: false
                };

                if (isValidRecommendation(recommendedArticle)) {
                    result.push(recommendedArticle);
                    recommendationIndex++;
                }
            } catch (error) {
                console.warn('Failed to fetch recommendation:', error);
            }
        }
    }
    
    return result;
}

/**
 * Loads a quality article with retries.
 */
async function loadQualityArticle(language: SupportedLanguage): Promise<WikiArticle | null> {
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        try {
            const article = await fetchRandomArticle(language);
            if (article && 
                isArticleQualityGood(article) && 
                isArticleDiverse(article, get(articles))) {
                return article;
            }
        } catch (error) {
            console.error('Error fetching article:', error);
        }
        attempts++;
    }
    return null;
}

/**
 * Loads articles into the buffer.
 */
async function loadArticlesIntoBuffer() {
    if (get(isLoadingBuffer)) return;
    
    isLoadingBuffer.set(true);
    try {
        const currentLanguage = get(language) as SupportedLanguage;
        const newArticles: WikiArticle[] = [];
        
        for (let i = 0; i < BATCH_SIZE; i++) {
            const article = await fetchRandomArticle(currentLanguage);
            if (article && isArticleQualityGood(article)) {
                newArticles.push(article);
            }
        }
        
        articleBuffer.update(currentBuffer => {
            const buffer = Array.isArray(currentBuffer) ? currentBuffer : [];
            return [...buffer, ...newArticles];
        });
        
    } catch (error) {
        console.error('Error loading articles into buffer:', error);
    } finally {
        isLoadingBuffer.set(false);
    }
}

/**
 * Fetches a valid image for an article.
 */
async function fetchValidImage(page: any, retries = MAX_RETRIES): Promise<{ main: string | undefined; thumbnail: string | undefined }> {
    try {
        const images = await page.images();
        const validImages = images.filter((img: { url: string; }) => 
            isValidImageUrl(img.url) && 
            !img.url.includes('Commons-logo') &&
            !img.url.includes('Wiki-logo') &&
            !img.url.endsWith('.svg')
        );

        if (validImages.length > 0) {
            const mainImage = validImages[0].url;
            const thumbnail = mainImage.replace(/\/\d+px-/, '/300px-');
            return { main: mainImage, thumbnail };
        }

        const summary = await page.summary();
        if (summary.thumbnail?.source) {
            return {
                main: summary.originalimage?.source,
                thumbnail: summary.thumbnail.source
            };
        }

        return { main: undefined, thumbnail: undefined };
    } catch (error) {
        if (retries > 0) {
            return fetchValidImage(page, retries - 1);
        }
        console.error('Error fetching valid image:', error);
        return { main: undefined, thumbnail: undefined };
    }
}

/**
 * Validates if an image URL is suitable.
 */
function isValidImageUrl(url: string): boolean {
    if (!url) return false;
    return (
        url.match(/\.(jpg|jpeg|png|gif)$/i) !== null &&
        !url.includes('placeholder') &&
        !url.includes('default') &&
        !url.includes('missing')
    );
}

/**
 * Extracts the page title from the random result.
 */
function extractPageTitle(result: any): string | null {
    if (typeof result === 'string') return result;
    if (typeof result === 'object' && result !== null) {
        if ('title' in result) return result.title;
        if ('pageid' in result) return String(result.pageid);
    }
    return null;
}

if (browser) {
    let scrollTimeout: NodeJS.Timeout;
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const now = Date.now();
        if (now - lastScroll < SCROLL_THROTTLE) return;
        lastScroll = now;

        if (scrollTimeout) clearTimeout(scrollTimeout);
        
        scrollTimeout = setTimeout(() => {
            const status = get(loadingStatus);
            if (status.isLoading) return;

            const windowBottom = window.scrollY + window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const remaining = documentHeight - windowBottom;
            const screenHeights = remaining / window.innerHeight;

            if (screenHeights <= 2) {
                loadMoreArticles(BATCH_SIZE);
            }
        }, 100);
    }, { passive: true });
}

if (browser) {
    language.subscribe(lang => {
        articles.set([]);
        if (articleLoaderWorker) {
            try {
                articleLoaderWorker.postMessage({
                    type: 'changeLanguage',
                    language: lang
                });
                loadMoreArticles(BATCH_SIZE * 2);
                preloadArticles();
            } catch (error) {
                console.error('Error changing language:', error);
                loadingMore.set(false);
                loadingStatus.update(s => ({ ...s, error: 'Failed to change language' }));
            }
        }
    });
}

/**
 * Preloads articles into the buffer.
 */
async function preloadArticles() {
    const status = get(loadingStatus);
    if (status.preloading) return;
    
    loadingStatus.update(s => ({ ...s, preloading: true }));
    
    try {
        const currentBuffer = get(articleBuffer) || []; 
        
        if (currentBuffer.length >= BUFFER_SIZE) return;
        
        const promises = Array(PARALLEL_LOADS)
            .fill(null)
            .map(() => fetchQualityArticle(get(language)));
        
        const newArticles = await Promise.all(promises);
        const validArticles = newArticles
            .filter((article): article is WikiArticle => article !== null)
            .filter(article => isArticleQualityGood(article));
            
        articleBuffer.update(buffer => {
            const currentBuffer = Array.isArray(buffer) ? buffer : [];
            return [...currentBuffer, ...validArticles];
        });
    } catch (error) {
        console.error('Error preloading articles:', error);
    } finally {
        loadingStatus.update(s => ({ ...s, preloading: false }));
    }
}

/**
 * Fetches a quality article with retries.
 */
async function fetchQualityArticle(language: SupportedLanguage): Promise<WikiArticle | null> {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            const article = await fetchRandomArticle(language);
            if (article && isArticleQualityGood(article)) {
                return article;
            }
        } catch (error) {
            console.warn('Failed to fetch quality article:', error);
        }
        attempts++;
    }
    return null;
}

/**
 * Loads more articles into the store.
 */
export async function loadMoreArticles(count = loadingState.batchSize) {
    if (loadingState.isLoading) return;
    
    loadingState.isLoading = true;
    loadingMore.set(true);
    
    try {
        if (browser && articleLoaderWorker) {
            articleLoaderWorker.postMessage({
                type: 'load',
                language: get(language),
                count
            });
            
            articleLoaderWorker.postMessage({
                type: 'prefetch',
                language: get(language)
            });
        } else {
            const newArticles = await loadQualityArticles(count);
            articles.update(existing => [...existing, ...newArticles]);
        }
        loadingState.retryCount = 0;
    } catch (error) {
        console.error('Error loading articles:', error);
        loadingState.retryCount++;
        
        if (loadingState.retryCount < loadingState.maxRetries) {
            setTimeout(() => loadMoreArticles(count), 1000);
        }
    } finally {
        loadingState.isLoading = false;
        loadingMore.set(false);
    }
}

/**
 * Loads quality articles with retries.
 */
async function loadQualityArticles(count: number): Promise<WikiArticle[]> {
    const currentLanguage = get(language) as SupportedLanguage;
    const loadedArticles: WikiArticle[] = [];
    
    while (loadedArticles.length < count) {
        try {
            const article = await fetchRandomArticle(currentLanguage);
            if (article && isArticleQualityGood(article) && isArticleDiverse(article, loadedArticles)) {
                loadedArticles.push(article);
            }
        } catch (error) {
            console.warn('Error loading article:', error);
        }
    }
    
    return loadedArticles;
}

/**
 * Validates if an article is of good quality.
 */
function isArticleQualityGood(article: WikiArticle): boolean {
    if (!article || !article.excerpt || article.excerpt.length < MINIMUM_EXCERPT_LENGTH) {
        return false;
    }
    if (!article.title || article.title.trim() === '') {
        return false;
    }
    return true;
}

/**
 * Checks if an article is diverse compared to recent articles.
 */
function isArticleDiverse(article: WikiArticle, existingArticles: WikiArticle[]): boolean {
    const windowSize = Math.min(DIVERSITY_WINDOW, existingArticles.length);
    const recentArticles = existingArticles.slice(-windowSize);

    return recentArticles.every(prevArticle => {
        return (
            prevArticle.id !== article.id &&
            prevArticle.title.toLowerCase() !== article.title.toLowerCase()
        );
    });
}

if (browser) {
    language.subscribe(lang => {
        articles.set([]);
        if (articleLoaderWorker) {
            try {
                articleLoaderWorker.postMessage({
                    type: 'changeLanguage',
                    language: lang
                });
            } catch (error) {
                console.error('Error changing language:', error);
                loadingMore.set(false);
                loadingStatus.update(s => ({ ...s, error: 'Failed to change language' }));
            }
        }
    });
}

language.subscribe(lang => {
    articles.set([]);
    try {
        if (articleLoaderWorker) {
            articleLoaderWorker.postMessage({
                type: 'reset',
                language: lang
            });
        }
    } catch (error) {
        console.error('Error loading articles:', error);
        loadingMore.set(false);
        loadingStatus.update(s => ({ ...s, error: 'Failed to load articles' }));
    }
});

/**
 * Checks the scroll position and prefetches articles if needed.
 */
export function checkScrollPosition(container: HTMLElement) {
    const scrollPercent = (container.scrollTop + container.clientHeight) / container.scrollHeight;
    
    if (scrollPercent > PRELOAD_THRESHOLD && articleLoaderWorker) {
        articleLoaderWorker.postMessage({
            type: 'prefetch',
            language: get(language)
        });
    }
}

