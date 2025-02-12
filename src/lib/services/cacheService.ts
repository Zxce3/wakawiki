/**
 * Cache Service
 * 
 * This service provides caching functionality for various types of data such as articles,
 * categories, summaries, and images. It helps improve performance by reducing redundant API calls.
 */

// Replace the SvelteKit environment import with direct check
const browser = typeof window !== 'undefined';

import type { WikiArticle, SupportedLanguage, ArticleRecommendation } from '$lib/types';

type CacheEntry<T> = {
    data: T;
    timestamp: number;
    language: SupportedLanguage;
};

class CacheService {
    private static instance: CacheService;
    private articleCache = new Map<string, CacheEntry<WikiArticle>>();
    private categoryCache = new Map<string, CacheEntry<string[]>>();
    private summaryCache = new Map<string, CacheEntry<any>>();
    private imageCache = new Map<string, CacheEntry<{ imageUrl?: string; thumbnail?: string }>>();
    private recommendationCache = new Map<string, CacheEntry<ArticleRecommendation[]>>();
    
    private readonly ARTICLE_TTL = 30 * 60 * 1000; // 30 minutes
    private readonly CATEGORY_TTL = 60 * 60 * 1000; // 1 hour
    private readonly SUMMARY_TTL = 15 * 60 * 1000; // 15 minutes
    private readonly IMAGE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    private readonly RECOMMENDATION_TTL = 15 * 60 * 1000; // 15 minutes

    private currentLanguage: SupportedLanguage = 'en';
    
    static getInstance(): CacheService {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }

    /**
     * Clears all caches when language changes
     */
    clearCacheForLanguage(newLanguage: SupportedLanguage) {
        if (this.currentLanguage !== newLanguage) {
            this.articleCache.clear();
            this.categoryCache.clear();
            this.summaryCache.clear();
            this.imageCache.clear();
            this.recommendationCache.clear();
            this.currentLanguage = newLanguage;
        }
    }

    /**
     * Clears all caches completely
     */
    clearAllCaches() {
        this.articleCache.clear();
        this.categoryCache.clear();
        this.summaryCache.clear();
        this.imageCache.clear();
        this.recommendationCache.clear();
        this.currentLanguage = 'en'; // Reset to default
    }

    /**
     * Sets a cache entry with a timestamp and language.
     */
    set<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, language: SupportedLanguage) {
        // Always verify language matches current before caching
        if (language !== this.currentLanguage) {
            return; // Don't cache if language doesn't match
        }
        cache.set(key, {
            data,
            timestamp: Date.now(),
            language
        });
    }

    /**
     * Retrieves a cache entry if it is still valid based on TTL.
     */
    get<T>(cache: Map<string, CacheEntry<T>>, key: string, ttl: number): T | null {
        const entry = cache.get(key);
        if (!entry) return null;
        
        if (Date.now() - entry.timestamp > ttl) {
            cache.delete(key);
            return null;
        }
        
        return entry.data;
    }

    async getFromCache<T>(cacheName: string, key: string): Promise<T | null> {
        if (!browser) return null;
        try {
            const cache = await caches.open(cacheName);
            const response = await cache.match(key);
            if (response) {
                const data = await response.json();
                console.debug(`Cache hit: ${cacheName}/${key}`);
                return data;
            }
            console.debug(`Cache miss: ${cacheName}/${key}`);
        } catch (error) {
            console.warn('Cache fetch failed:', error);
        }
        return null;
    }

    async addToCache(cacheName: string, key: string, data: any): Promise<void> {
        if (!browser) return;
        try {
            const cache = await caches.open(cacheName);
            const response = new Response(JSON.stringify(data));
            await cache.put(key, response);
            console.debug(`Cached: ${cacheName}/${key}`);
        } catch (error) {
            console.warn('Cache save failed:', error);
        }
    }

    /**
     * Caches an article.
     */
    async setArticle(article: WikiArticle, language: SupportedLanguage): Promise<void> {
        const key = `${language}-${article.id}`;
        // Set in memory cache
        this.set(this.articleCache, key, article, language);
        // Set in PWA cache
        await this.addToCache('articles-cache-v1', key, article);
    }

    /**
     * Retrieves a cached article.
     */
    async getArticle(id: string, language: SupportedLanguage): Promise<WikiArticle | null> {
        // Try memory cache first
        const memoryCache = this.get(this.articleCache, `${language}-${id}`, this.ARTICLE_TTL);
        if (memoryCache) return memoryCache;

        // Try PWA cache
        return await this.getFromCache('articles-cache-v1', `${language}-${id}`);
    }

    /**
     * Caches categories for an article.
     */
    setCategories(articleId: string, categories: string[], language: SupportedLanguage) {
        const key = `${language}-${articleId}`;
        this.set(this.categoryCache, key, categories, language);
    }

    /**
     * Retrieves cached categories for an article.
     */
    getCategories(articleId: string, language: SupportedLanguage): string[] | null {
        const key = `${language}-${articleId}`;
        return this.get(this.categoryCache, key, this.CATEGORY_TTL);
    }

    /**
     * Caches a summary for an article.
     */
    setSummary(articleId: string, summary: any, language: SupportedLanguage) {
        const key = `${language}-${articleId}`;
        this.set(this.summaryCache, key, summary, language);
    }

    /**
     * Retrieves a cached summary for an article.
     */
    getSummary(articleId: string, language: SupportedLanguage): any | null {
        const key = `${language}-${articleId}`;
        return this.get(this.summaryCache, key, this.SUMMARY_TTL);
    }

    /**
     * Retrieves cached images for an article.
     */
    async getArticleImages(articleId: string, language: SupportedLanguage) {
        const key = `${language}-${articleId}`;
        
        // Try memory cache first
        const memCache = this.get(this.imageCache, key, this.IMAGE_TTL);
        if (memCache) return memCache;

        // Try PWA cache
        const pwaCache = await this.getFromCache('images-cache-v1', key);
        if (pwaCache) {
            // Restore to memory cache
            this.set(this.imageCache, key, pwaCache, language);
            return pwaCache;
        }

        return null;
    }

    /**
     * Caches images for an article.
     */
    async setArticleImages(
        articleId: string, 
        images: { imageUrl?: string; thumbnail?: string }, 
        language: SupportedLanguage
    ): Promise<void> {
        const key = `${language}-${articleId}`;
        
        try {
            // Cache in memory
            this.set(this.imageCache, key, images, language);

            // Cache in PWA cache
            if (images.imageUrl) {
                await this.precacheImage(images.imageUrl);
            }
            if (images.thumbnail) {
                await this.precacheImage(images.thumbnail);
            }

            // Also cache in IndexedDB for offline access
            await this.addToCache('images-cache-v1', key, images);
        } catch (error) {
            console.warn('Failed to cache images:', error);
        }
    }

    /**
     * Pre-cache an image using the Cache API
     */
    public async precacheImage(url: string): Promise<void> {
        if (!browser) return;

        try {
            const cache = await caches.open('wakawiki-images-v1');
            const response = await fetch(url, {
                mode: 'cors',
                credentials: 'omit',
                headers: {
                    'Accept': 'image/*'
                }
            });
            
            if (response.ok) {
                await cache.put(url, response);
                console.debug(`Image cached: ${url}`);
            }
        } catch (error) {
            console.warn(`Failed to precache image: ${url}`, error);
        }
    }

    /**
     * Caches recommendations for a user
     */
    // Add these public methods
    public async setRecommendations(key: string, recommendations: ArticleRecommendation[], language: SupportedLanguage): Promise<void> {
        const cacheKey = `recommendations-${language}-${key}`;
        this.set(this.recommendationCache, cacheKey, recommendations, language);
        // Also cache in PWA cache
        await this.addToCache('recommendations-cache-v1', cacheKey, recommendations);
    }
    /**
     * Retrieves cached recommendations for a user
     */

    public async getRecommendations(key: string, language: SupportedLanguage): Promise<ArticleRecommendation[] | null> {
        const cacheKey = `recommendations-${language}-${key}`;
        
        // Try memory cache first
        const memCache = this.get(this.recommendationCache, cacheKey, this.RECOMMENDATION_TTL);
        if (memCache) return memCache;

        // Try PWA cache
        return await this.getFromCache('recommendations-cache-v1', cacheKey);
    }

    /**
     * Cleans up expired cache entries.
     */
    cleanup() {
        const now = Date.now();
        
        [
            { cache: this.articleCache, ttl: this.ARTICLE_TTL },
            { cache: this.categoryCache, ttl: this.CATEGORY_TTL },
            { cache: this.summaryCache, ttl: this.SUMMARY_TTL },
            { cache: this.imageCache, ttl: this.IMAGE_TTL },
            { cache: this.recommendationCache, ttl: this.RECOMMENDATION_TTL }
        ].forEach(({ cache, ttl }) => {
            for (const [key, entry] of cache.entries()) {
                if (now - entry.timestamp > ttl) {
                    cache.delete(key);
                }
            }
        });
    }

    /**
     * Initializes cache with service worker
     */
    async initialize() {
        if (!browser) return;

        try {
            const registration = await navigator.serviceWorker.ready;
            if (registration.active) {
                // Clear caches when language changes to avoid stale data
                registration.active.postMessage({
                    type: 'CLEAR_CACHE',
                    language: this.currentLanguage
                });
            }
        } catch (error) {
            console.warn('Failed to initialize cache service:', error);
        }
    }

    /**
     * Forces an immediate cache cleanup
     */
    async forceCacheCleanup() {
        if (!browser) return;

        try {
            const keys = await caches.keys();
            await Promise.all(
                keys.map(key => caches.delete(key))
            );
            this.clearAllCaches();
            await this.initialize();
        } catch (error) {
            console.error('Error cleaning up caches:', error);
        }
    }
}

export const cacheService = CacheService.getInstance();

// Periodically clean up expired cache entries
setInterval(() => cacheService.cleanup(), 5 * 60 * 1000);
