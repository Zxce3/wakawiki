/**
 * Article Loader Worker
 * 
 * This worker prefetches and caches Wikipedia articles to improve loading times.
 * It handles fetching random articles, managing a buffer, and caching articles.
 */

import wiki from 'wikipedia';
import type { WikiArticle, SupportedLanguage } from '../types';
import { fetchRandomArticle } from '../api/wikipedia';
import { cacheService } from '../services/cacheService';

// Constants - moved to top
const BATCH_SIZE = 5;
const BUFFER_SIZE = 15;
const MAX_RETRIES = 3;
const MAX_CACHE_SIZE = 50;
const PREFETCH_THRESHOLD = 10;
const MEMORY_BUFFER_SIZE = 50;
const BATCH_RETRY_LIMIT = 5;
const RATE_LIMIT_DELAY = 300;
const ERROR_RETRY_DELAY = 1000;
const MAX_PARALLEL_REQUESTS = 2;
const DELAY_BETWEEN_REQUESTS = 250;

const articleCache = new Map<string, WikiArticle>();
const articleBuffer: WikiArticle[] = [];
const memoryBuffer = new Map<string, WikiArticle>();
const fetchQueue: Array<() => Promise<void>> = [];
let isProcessing = false;

// Initialize wiki language before any operations
(async () => {
    try {
        await wiki.setLang('en');
    } catch (error) {
        console.error(error);
    }
})();

/**
 * Loads a batch of random articles.
 */
async function loadArticleBatch(language: SupportedLanguage, count: number): Promise<WikiArticle[]> {
    const articles: WikiArticle[] = [];
    let retries = 0;
    const maxRetries = 3;

    while (articles.length < count && retries < maxRetries) {
        try {
            const article = await fetchRandomArticle(language);
            if (article && isValidArticle(article)) {
                articles.push(article);
                
                // Maintain cache size
                if (articleCache.size >= MAX_CACHE_SIZE) {
                    const firstKey = articleCache.keys().next().value;
                    if (firstKey !== undefined) {
                        articleCache.delete(firstKey);
                    }
                }
                articleCache.set(article.id, article);
            }
        } catch (error) {
            console.warn('Error fetching article:', error);
            retries++;
        }
    }

    return articles;
}

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

self.onmessage = async (event: MessageEvent<LoaderMessage>) => {
    try {
        const { type, language, count = BATCH_SIZE, immediate = false } = event.data;

        // Set language before any operation
        if (language) {
            await wiki.setLang(language);
        }

        switch (type) {
            case 'load':
                const articles = await getArticles(language, count);
                if (articles.length > 0) {
                    self.postMessage({ 
                        type: 'articles', 
                        articles: articles,
                        language,
                        immediate
                    });
                    
                    // Start prefetching immediately after initial load
                    if (immediate) {
                        prefetchArticles(language);
                    }
                }
                break;

            case 'changeLanguage':
                articleBuffer.length = 0; // Clear buffer
                await wiki.setLang(language);
                await prefetchArticles(language);
                break;

            case 'prefetch':
                await prefetchArticles(language);
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

// Don't auto-initialize, wait for language
// Remove the immediate execution

/**
 * Processes the fetch queue to manage parallel requests.
 */
async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;
    
    while (fetchQueue.length > 0) {
        const task = fetchQueue.shift();
        if (task) {
            try {
                await task();
            } catch (error) {
                console.error('Error processing fetch queue:', error);
            }
        }
    }
    
    isProcessing = false;
}

/**
 * Fetches a specified number of articles.
 */
async function getArticles(language: SupportedLanguage, count: number): Promise<WikiArticle[]> {
    const articles: WikiArticle[] = [];
    let retryCount = 0;
    const maxRetries = 3;

    while (articles.length < count && retryCount < maxRetries) {
        try {
            const batchSize = Math.min(3, count - articles.length);
            const batch = await Promise.all(
                Array(batchSize).fill(null).map(() => fetchRandomArticle(language))
            );
            
            const validArticles = batch
                .filter((article): article is WikiArticle => 
                    article !== null && isValidArticle(article));
            
            articles.push(...validArticles);
        } catch (error) {
            console.warn('Error fetching batch:', error);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return articles;
}

/**
 * Prefetches articles to maintain a buffer.
 */
async function prefetchArticles(language: SupportedLanguage): Promise<void> {
    if (articleBuffer.length >= PREFETCH_THRESHOLD) return;

    const needed = Math.min(MAX_PARALLEL_REQUESTS, PREFETCH_THRESHOLD - articleBuffer.length);
    
    try {
        const newArticles = await getArticles(language, needed);
        articleBuffer.push(...newArticles);
        newArticles.forEach(article => addToMemoryBuffer(article));
        
        self.postMessage({ 
            type: 'bufferStatus', 
            count: articleBuffer.length + memoryBuffer.size
        });
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
