/**
 * Cache Service
 * 
 * This service provides caching functionality for various types of data such as articles,
 * categories, summaries, and images. It helps improve performance by reducing redundant API calls.
 */

import type { WikiArticle, SupportedLanguage } from '../types';

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
    
    private readonly ARTICLE_TTL = 30 * 60 * 1000; // 30 minutes
    private readonly CATEGORY_TTL = 60 * 60 * 1000; // 1 hour
    private readonly SUMMARY_TTL = 15 * 60 * 1000; // 15 minutes
    private readonly IMAGE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    
    static getInstance(): CacheService {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }

    /**
     * Sets a cache entry with a timestamp and language.
     */
    set<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, language: SupportedLanguage) {
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

    /**
     * Caches an article.
     */
    setArticle(article: WikiArticle, language: SupportedLanguage) {
        const key = `${language}-${article.id}`;
        this.set(this.articleCache, key, article, language);
    }

    /**
     * Retrieves a cached article.
     */
    getArticle(id: string, language: SupportedLanguage): WikiArticle | null {
        const key = `${language}-${id}`;
        return this.get(this.articleCache, key, this.ARTICLE_TTL);
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
    getArticleImages(articleId: string, language: SupportedLanguage) {
        return this.get(this.imageCache, `${language}-${articleId}`, this.IMAGE_TTL);
    }

    /**
     * Caches images for an article.
     */
    setArticleImages(articleId: string, images: { imageUrl?: string; thumbnail?: string }, language: SupportedLanguage) {
        this.set(this.imageCache, `${language}-${articleId}`, images, language);
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
            { cache: this.imageCache, ttl: this.IMAGE_TTL }
        ].forEach(({ cache, ttl }) => {
            for (const [key, entry] of cache.entries()) {
                if (now - entry.timestamp > ttl) {
                    cache.delete(key);
                }
            }
        });
    }
}

export const cacheService = CacheService.getInstance();

// Periodically clean up expired cache entries
setInterval(() => cacheService.cleanup(), 5 * 60 * 1000);
