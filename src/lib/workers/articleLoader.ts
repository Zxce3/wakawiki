/**
 * Article Loader Worker
 * 
 * This worker prefetches and caches Wikipedia articles to improve loading times.
 * It handles fetching random articles, managing a buffer, and caching articles.
 */

import wiki from 'wikipedia';
import type { WikiArticle, SupportedLanguage } from '$lib/types';
import { fetchRandomArticle } from '$lib/api/wikipedia';
import { cacheService } from '$lib/services/cacheService';

const BATCH_SIZE = 5;
const PREFETCH_THRESHOLD = 10;
const MEMORY_BUFFER_SIZE = 50;
const MAX_PARALLEL_REQUESTS = 2;
const BUFFER_LIMIT = 20; // Maximum number of articles in buffer
const MAX_FETCH_ATTEMPTS = 5; // Maximum attempts to fetch articles
let isLoadingArticles = false; // Loading lock

const articleCache = new Map<string, WikiArticle>();
const articleBuffer: WikiArticle[] = [];
const memoryBuffer = new Map<string, WikiArticle>();

const MAX_BUFFER_SIZE = 15; // Strict limit on buffer size
const MIN_ARTICLES_TO_DISPLAY = 3; // Minimum articles for initial display

// Add new constants
const IMMEDIATE_FETCH_COUNT = 2; // Number of articles to fetch immediately
const DISPLAY_TIMEOUT = 2000; // Maximum time to wait for initial articles

// Remove the auto-initialization
// (async () => {
//     try {
//         await wiki.setLang('en');
//     } catch (error) {
//         console.error(error);
//     }
// })();


/**
 * Adds an article to the memory buffer.
 */
function addToMemoryBuffer(article: WikiArticle) {
    if (memoryBuffer.size >= MEMORY_BUFFER_SIZE) {
        const firstKey = memoryBuffer.keys().next().value;
        if (firstKey !== undefined) {
            memoryBuffer.delete(firstKey);
        }
    }
    memoryBuffer.set(article.id, article);
}

interface LoaderMessage {
    type: 'load' | 'prefetch' | 'changeLanguage';
    language: SupportedLanguage;
    count?: number;
    immediate?: boolean;
}

// Add loading state tracking
let currentLanguage: SupportedLanguage | null = null;
let loadingQueue: Array<() => Promise<void>> = [];
const QUEUE_PROCESS_DELAY = 100;

async function processLoadingQueue() {
    while (loadingQueue.length > 0) {
        const task = loadingQueue.shift();
        if (task) {
            await task();
            await new Promise(resolve => setTimeout(resolve, QUEUE_PROCESS_DELAY));
        }
    }
}

self.onmessage = async (event: MessageEvent<LoaderMessage>) => {
    try {
        const { type, language, count = BATCH_SIZE } = event.data;

        // Handle language change
        if (currentLanguage !== language) {
            currentLanguage = language;
            articleBuffer.length = 0;
            memoryBuffer.clear();
            articleCache.clear();
            loadingQueue = []; // Clear loading queue
            await wiki.setLang(language);
            cacheService.clearAllCaches();
        }

        switch (type) {
            case 'load':
                await getArticles(language, count);
                break;
                
            case 'prefetch':
                if (loadingQueue.length === 0) {
                    await prefetchArticles(language);
                }
                break;
        }
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({ 
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

/**
 * Fetches a specified number of articles.
 */
async function getArticles(language: SupportedLanguage, count: number): Promise<WikiArticle[]> {
    if (isLoadingArticles) return [];
    isLoadingArticles = true;

    try {
        // Parallel fetch for all articles
        const fetchPromises = Array(count)
            .fill(null)
            .map(() => fetchRandomArticle(language));

        for (let i = 0; i < fetchPromises.length; i++) {
            try {
                const article = await fetchPromises[i];
                if (article && isValidArticle(article)) {
                    // Send articles as they arrive
                    self.postMessage({
                        type: 'articles',
                        articles: [article],
                        immediate: i < 2 // First two articles are immediate
                    });
                }
            } catch (error) {
                console.warn('Error fetching article:', error);
            }
            
            // Small delay between articles to prevent UI blocking
            if (i < fetchPromises.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    } finally {
        isLoadingArticles = false;
    }

    return [];
}

// Make recommendation fetching non-blocking
async function fetchRemainingArticles(language: SupportedLanguage, count: number): Promise<WikiArticle[]> {
    const articles: WikiArticle[] = [];
    let retryCount = 0;

    while (articles.length < count && retryCount < MAX_FETCH_ATTEMPTS) {
        try {
            const article = await fetchRandomArticle(language);
            if (article && isValidArticle(article) && !articles.some(a => a.id === article.id)) {
                articles.push(article);
                // Send articles one by one to show progress
                if (articles.length % 2 === 0) {
                    self.postMessage({
                        type: 'articles',
                        articles: [article],
                        immediate: false
                    });
                }
            }
        } catch (error) {
            console.warn('Error fetching article:', error);
            retryCount++;
        }
        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return articles;
}

/**
 * Prefetches articles to maintain a buffer.
 */
async function prefetchArticles(language: SupportedLanguage): Promise<void> {
    if (articleBuffer.length >= MAX_BUFFER_SIZE) {
        // Remove excess articles from buffer
        articleBuffer.splice(0, articleBuffer.length - MAX_BUFFER_SIZE + 5);
        return;
    }

    if (articleBuffer.length >= PREFETCH_THRESHOLD) return;

    const needed = Math.min(MAX_PARALLEL_REQUESTS, MAX_BUFFER_SIZE - articleBuffer.length);
    
    try {
        const articles = await fetchRemainingArticles(language, needed);
        if (articles.length > 0) {
            // Only keep unique articles in buffer
            const uniqueArticles = articles.filter(article => 
                !articleBuffer.some(a => a.id === article.id)
            );
            
            articleBuffer.push(...uniqueArticles);
            uniqueArticles.forEach(article => {
                addToMemoryBuffer(article);
            });
        }
    } catch (error) {
        console.warn('Error prefetching articles:', error);
    }
}

/**
 * Validates if an article is suitable for caching and recommendations.
 */
function isValidArticle(article: WikiArticle | null): article is WikiArticle {
    if (!article) return false;
    
    return Boolean(
        article.title &&
        article.excerpt &&
        article.excerpt.length >= 100 &&
        article.imageUrl &&
        !article.title.includes('List of') &&
        !article.title.match(/^\d+/) &&
        !article.title.includes('(disambiguation)') &&
        !article.title.startsWith('File:') &&
        !article.title.startsWith('Template:')
    );
}
