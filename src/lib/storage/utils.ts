/**
 * Storage Utilities
 * 
 * This module provides utility functions for interacting with local storage.
 * It includes functions for storing and retrieving user interactions, liked articles,
 * language settings, and feedback.
 */

import { browser } from '$app/environment';
import type {
    WikiArticle,
    UserInteraction,
    LikedArticle,
    SupportedLanguage,
    ArticleFeedback
} from '$lib/types';

const STORAGE_KEYS = {
    INTERACTIONS: 'wakawiki:interactions',
    ARTICLES: 'wakawiki:articles',
    LIKES: 'wakawiki:likes',
    LIKED_ARTICLES: 'wakawiki:liked_articles',
    LANGUAGE: 'wakawiki:language',
    FEEDBACK: 'wakawiki:feedback',
    PREFERENCES: 'wakawiki:preferences',
    LAST_CLEANUP: 'wakawiki:last_cleanup'
} as const;

const OFFLINE_KEYS = {
    OFFLINE_ARTICLES: 'wakawiki:offline_articles',
    LAST_SYNC: 'wakawiki:last_sync'
} as const;

const STORAGE_VERSION = '1.0';
const CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // One week

interface StorageMetadata {
    version: string;
    lastUpdated: number;
}

/**
 * Retrieves data from local storage.
 */
function getStorage<T>(key: string, defaultValue: T): T {
    if (!browser) return defaultValue;
    try {
        const data = localStorage.getItem(key);
        if (!data) return defaultValue;

        const parsed = JSON.parse(data);
        
        if (parsed && parsed._metadata) {
            if (parsed._metadata.version !== STORAGE_VERSION) {
                console.warn('Storage version mismatch, clearing data');
                localStorage.removeItem(key);
                return defaultValue;
            }
            return parsed.data;
        }
        return parsed;
    } catch (error) {
        console.error(`Error reading from storage (${key}):`, error);
        return defaultValue;
    }
}

/**
 * Stores data in local storage.
 */
function setStorage<T>(key: string, value: T): void {
    if (!browser) return;
    try {
        const storageData = {
            _metadata: {
                version: STORAGE_VERSION,
                lastUpdated: Date.now()
            },
            data: value
        };
        localStorage.setItem(key, JSON.stringify(storageData));
    } catch (error) {
        console.error(`Error writing to storage (${key}):`, error);
    }
}

/**
 * Stores a user interaction in local storage.
 */
export async function storeInteraction(interaction: UserInteraction): Promise<void> {
    if (!browser) return;
    const interactions = getStorage<UserInteraction[]>(STORAGE_KEYS.INTERACTIONS, []);

    // Keep interactions from the last 15 days and limit to 50 entries
    const fifteenDaysAgo = Date.now() - (15 * 24 * 60 * 60 * 1000);
    const filteredInteractions = interactions
        .filter(i => i.timestamp > fifteenDaysAgo)

    filteredInteractions.push(interaction);
    setStorage(STORAGE_KEYS.INTERACTIONS, filteredInteractions);
}

/**
 * Retrieves user interactions from local storage.
 */
export async function getInteractions(): Promise<UserInteraction[]> {
    return getStorage<UserInteraction[]>(STORAGE_KEYS.INTERACTIONS, []);
}

/**
 * Retrieves liked articles from local storage.
 */
export async function getLikedArticles(): Promise<Set<string>> {
    const articles = getStorage<any[]>(STORAGE_KEYS.ARTICLES, []);
    return new Set(articles.map(a => String(a.pageid)));
}

/**
 * Toggles the like status of an article.
 */
export async function toggleLike(article: WikiArticle): Promise<boolean> {
    const likes = await getLikedArticles();
    const isLiked = likes.has(article.id);

    if (isLiked) {
        await removeLikedArticle(article.id);
    } else {
        await storeLikedArticle(article);
    }

    return !isLiked;
}

/**
 * Checks if an article is liked.
 */
export async function isArticleLiked(articleId: string): Promise<boolean> {
    const likes = await getLikedArticles();
    return likes.has(articleId);
}

/**
 * Cleans up old data from local storage.
 */
export async function cleanupOldData(): Promise<void> {
    if (!browser) return;
    const interactions = getStorage<UserInteraction[]>(STORAGE_KEYS.INTERACTIONS, []);
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    const filteredInteractions = interactions.filter(i => i.timestamp > thirtyDaysAgo);
    setStorage(STORAGE_KEYS.INTERACTIONS, filteredInteractions);
}

/**
 * Stores a liked article in local storage with better error handling
 */
export async function storeLikedArticle(article: WikiArticle): Promise<void> {
    if (!browser || !article?.id) return;

    try {
        const likedArticle: LikedArticle = {
            id: article.id,
            timestamp: Date.now(),
            article
        };

        const likedArticles = getStorage<LikedArticle[]>(STORAGE_KEYS.LIKED_ARTICLES, []);
        const existingIndex = likedArticles.findIndex(a => a.id === article.id);

        if (existingIndex === -1) {
            likedArticles.push(likedArticle);
        } else {
            likedArticles[existingIndex] = likedArticle;
        }

        setStorage(STORAGE_KEYS.LIKED_ARTICLES, likedArticles);
        
        // Also store in liked-ids for faster lookups
        const likedIds = new Set(likedArticles.map(a => a.id));
        localStorage.setItem('wakawiki:liked-ids', JSON.stringify(Array.from(likedIds)));
    } catch (error) {
        console.error('Error storing liked article:', error);
    }
}

/**
 * Removes a liked article from local storage.
 */
export async function removeLikedArticle(articleId: string): Promise<void> {
    const likedArticles = getStorage<LikedArticle[]>(STORAGE_KEYS.LIKED_ARTICLES, []);
    const updatedArticles = likedArticles.filter(a => a.id !== articleId);
    setStorage(STORAGE_KEYS.LIKED_ARTICLES, updatedArticles);
}

/**
 * Migrates old format liked articles to new format
 */
function migrateOldLikedArticles(data: any): LikedArticle[] {
    try {
        // Check if it's the old format with _metadata wrapper
        if (data?._metadata && Array.isArray(data.data)) {
            return data.data.map((item: any) => ({
                id: item.article.id,
                timestamp: item.timestamp,
                article: item.article
            }));
        }
        
        // If it's already an array, assume it's the new format
        if (Array.isArray(data)) {
            return data;
        }

        return [];
    } catch (error) {
        console.warn('Error migrating old liked articles:', error);
        return [];
    }
}

/**
 * Retrieves liked articles data with validation and migration support
 */
export async function getLikedArticlesData(): Promise<WikiArticle[]> {
    if (!browser) return [];

    try {
        // Try to get from liked-ids first
        const likedIdsStr = localStorage.getItem('wakawiki:liked-ids');
        let likedIds = new Set<string>();

        // Get full article data
        const rawData = localStorage.getItem(STORAGE_KEYS.LIKED_ARTICLES);
        let likedArticles: LikedArticle[] = [];

        if (rawData) {
            try {
                const parsed = JSON.parse(rawData);
                // Handle old format
                likedArticles = migrateOldLikedArticles(parsed);
                
                // Update liked-ids from migrated data
                likedIds = new Set(likedArticles.map(a => a.id));
                
                // Save migrated data in new format
                setStorage(STORAGE_KEYS.LIKED_ARTICLES, likedArticles);
                localStorage.setItem('wakawiki:liked-ids', JSON.stringify(Array.from(likedIds)));
            } catch (error) {
                console.error('Error parsing liked articles:', error);
            }
        } else if (likedIdsStr) {
            // If we only have liked-ids but no articles data
            likedIds = new Set(JSON.parse(likedIdsStr));
        }

        // Filter valid articles
        const validArticles = likedArticles
            .filter(item => likedIds.has(item.id) && isValidArticle(item.article))
            .map(item => item.article);

        return validArticles;
    } catch (error) {
        console.error('Error getting liked articles:', error);
        return [];
    }
}

/**
 * Enhanced validation to handle old article format
 */
function isValidArticle(article: any): article is WikiArticle {
    return article 
        && typeof article === 'object'
        && typeof article.id === 'string'
        && typeof article.title === 'string'
        && typeof article.url === 'string'
        // Add backward compatibility for optional fields
        && (typeof article.excerpt === 'string' || article.excerpt === undefined)
        && (typeof article.imageUrl === 'string' || article.imageUrl === undefined)
        && (typeof article.thumbnail === 'string' || article.thumbnail === undefined)
        && (typeof article.language === 'string' || article.language === undefined)
        && (typeof article.content === 'string' || article.content === undefined);
}

/**
 * Cleans up old storage data.
 */
export async function cleanupOldStorage(): Promise<void> {
    if (!browser) return;
    Object.values(STORAGE_KEYS).forEach(key => {
        if (key !== STORAGE_KEYS.LIKED_ARTICLES) {
            localStorage.removeItem(key);
        }
    });
}

/**
 * Periodically cleans up storage data.
 */
export async function cleanupStorage(): Promise<void> {
    if (!browser) return;

    const lastCleanup = getStorage<number>(STORAGE_KEYS.LAST_CLEANUP, 0);
    const now = Date.now();

    if (now - lastCleanup < CLEANUP_INTERVAL) return;

    try {
        // Clean up interactions older than 30 days
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

        const interactions = getStorage<UserInteraction[]>(STORAGE_KEYS.INTERACTIONS, [])
            .filter(i => i.timestamp > thirtyDaysAgo);
        setStorage(STORAGE_KEYS.INTERACTIONS, interactions);

        const feedback = getStorage<ArticleFeedback[]>(STORAGE_KEYS.FEEDBACK, [])
            .filter(f => f.timestamp > thirtyDaysAgo);
        setStorage(STORAGE_KEYS.FEEDBACK, feedback);

        setStorage(STORAGE_KEYS.LAST_CLEANUP, now);

    } catch (error) {
        console.error('Error during storage cleanup:', error);
    }
}

/**
 * Retrieves the stored language from local storage.
 */
export async function getStoredLanguage(): Promise<SupportedLanguage | null> {
    return getStorage<SupportedLanguage | null>(STORAGE_KEYS.LANGUAGE, null);
}

/**
 * Stores the language setting in local storage.
 */
export async function setStoredLanguage(language: SupportedLanguage): Promise<void> {
    setStorage(STORAGE_KEYS.LANGUAGE, language);
}

/**
 * Stores feedback in local storage.
 */
export async function storeFeedback(feedback: ArticleFeedback): Promise<void> {
    const feedbacks = getStorage<ArticleFeedback[]>(STORAGE_KEYS.FEEDBACK, []);
    feedbacks.push(feedback);

    // Limit feedback history to 100 entries
    if (feedbacks.length > 100) {
        feedbacks.shift();
    }

    setStorage(STORAGE_KEYS.FEEDBACK, feedbacks);
}

/**
 * Retrieves feedback history from local storage.
 */
export async function getFeedbackHistory(): Promise<ArticleFeedback[]> {
    return getStorage<ArticleFeedback[]>(STORAGE_KEYS.FEEDBACK, []);
}

/**
 * Retrieves the browser's language setting.
 */
export function getBrowserLanguage(): SupportedLanguage {
    if (typeof window === 'undefined' || !navigator) {
        return 'en';
    }

    const browserLang = navigator.language.split('-')[0];

    const supportedLanguages: SupportedLanguage[] = ['en', 'es', 'fr', 'de'];

    return supportedLanguages.includes(browserLang as SupportedLanguage)
        ? browserLang as SupportedLanguage
        : 'en';
}

/**
 * Stores articles for offline access
 */
export async function storeOfflineArticle(article: WikiArticle): Promise<void> {
    const offlineArticles = getStorage<WikiArticle[]>(OFFLINE_KEYS.OFFLINE_ARTICLES, []);
    const existingIndex = offlineArticles.findIndex(a => a.id === article.id);
    
    if (existingIndex === -1) {
        offlineArticles.push(article);
    } else {
        offlineArticles[existingIndex] = article;
    }
    
    setStorage(OFFLINE_KEYS.OFFLINE_ARTICLES, offlineArticles);
}

/**
 * Retrieves offline articles
 */
export async function getOfflineArticles(): Promise<WikiArticle[]> {
    return getStorage<WikiArticle[]>(OFFLINE_KEYS.OFFLINE_ARTICLES, []);
}

/**
 * Checks if we have offline articles available
 */
export function hasOfflineContent(): boolean {
    if (!browser) return false;
    const articles = getStorage<WikiArticle[]>(OFFLINE_KEYS.OFFLINE_ARTICLES, []);
    return articles.length > 0;
}
