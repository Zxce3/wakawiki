/**
 * Wikipedia API Integration Module
 * 
 * This module provides a comprehensive interface to interact with Wikipedia's API.
 * It handles article fetching, searching, caching, and error management while
 * implementing smart throttling to respect API rate limits.
 */

import wiki from 'wikipedia';
import type {
  WikiArticle,
  SupportedLanguage,
  PageOptions,
  SearchOptions,
  ListOptions,
  Infobox,
  WikiError,
  WikiPage,
  WikiResponse,
  WikiSummary,
  WikiMetadata
} from '$lib/types';
import { cacheService } from '../services/cacheService';


const WIKIPEDIA_BASE_URL = 'https://wikipedia.org/api/rest_v1';

/**
 * Implements a retry mechanism for failed API operations
 * Retries the operation until maxAttempts is reached or it succeeds
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  delay = 1000
): Promise<T> {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  throw lastError;
}


const FETCH_TIMEOUT = 5000; // Timeout for fetch operations

/**
 * Language management system
 * Keeps track of the current language and caches available languages
 * to reduce unnecessary API calls
 */
let currentLanguage: string | null = null;
let languagesCache: { lang: string; name: string }[] | null = null;

export async function getAvailableLanguages() {
    if (languagesCache) return languagesCache;
    
    try {
        const languages = await wiki.languages();
        const formattedLanguages = languages.map(lang => ({
            lang: lang.code,
            name: lang.name
        }));
        languagesCache = formattedLanguages;
        return formattedLanguages;
    } catch (error) {
        console.error('Error fetching languages:', error);
        return [];
    }
}

async function ensureLanguage(language: SupportedLanguage): Promise<void> {
    if (currentLanguage !== language) {
        wiki.setLang(language);
        currentLanguage = language;
    }
}

/**
 * Article caching system
 * Maintains a temporary store of fetched articles to improve performance
 * and reduce API load
 */
const articleCache = new Map<string, {
    article: WikiArticle;
    timestamp: number;
}>();


const ARTICLE_CACHE_DURATION = 10 * 60 * 1000; // Cache duration for articles

/** 
 * API request throttling
 * Ensures we're being good citizens and not overwhelming the Wikipedia API
 */
const API_DELAY = 300; // Delay between API requests
let lastRequestTime = 0;

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function throttledRequest<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeToWait = Math.max(0, API_DELAY - (now - lastRequestTime));
    
    if (timeToWait > 0) {
        await delay(timeToWait);
    }
    
    lastRequestTime = Date.now();
    return fn();
}


async function fetchImagesSafely(page: any): Promise<string[]> {
    try {
        const [images, summary] = await Promise.all([
            page.images(),
            page.summary()
        ]);

        const validImages = [];

        // Add thumbnail from summary if available
        if (summary?.thumbnail?.source) {
            validImages.push(summary.thumbnail.source);
        }

        // Add other valid images
        if (images?.length) {
            const filteredImages = images.filter((img: any) => {
                const url = img.url || '';
                return (
                    url.match(/\.(jpg|jpeg|png|gif)$/i) &&
                    !url.includes('Commons-logo') &&
                    !url.includes('Wiki-logo') &&
                    !url.includes('Icon') &&
                    !url.endsWith('.svg') &&
                    !url.includes('Placeholder') &&
                    !url.includes('Symbol')
                );
            }).map((img: any) => img.url);
            validImages.push(...filteredImages);
        }

        return [...new Set(validImages)]; // Remove duplicates
    } catch (error) {
        console.warn('Error fetching images:', error);
        return [];
    }
}

/**
 * The Random Article Explorer
 * 
 * This function is like a digital archaeologist, digging through Wikipedia
 * to discover interesting articles. It handles various edge cases and ensures
 * we get high-quality results with images when possible.
 */
export async function getRandomArticle(language: SupportedLanguage): Promise<WikiArticle | null> {
    try {
        wiki.setLang(language);
        
        
        const randomResult = await retryOperation(
            () => throttledRequest(() => wiki.random())
        );
        
        if (!randomResult) return null;
        
        
        const pageTitle = typeof randomResult === 'string' ? randomResult : 'title' in randomResult ? randomResult.title : '';
        const page = await throttledRequest(() => wiki.page(pageTitle));
        
        
        const summary = await throttledRequest(() => page.summary());
        if (!summary) return null;

        
        const article: WikiArticle = {
            id: String(summary.pageid),
            title: summary.title,
            excerpt: summary.extract || '',
            imageUrl: summary.thumbnail?.source,
            thumbnail: summary.thumbnail?.source,
            language,
            url: summary.content_urls?.desktop?.page || '',
            content: summary.extract || '',
            lastModified: Date.now().toString(),
            imagePending: false
        };

        
        if (!article.imageUrl) {
            try {
                const images = await fetchImagesSafely(page);
                if (images.length > 0) {
                    article.imageUrl = images[0];
                    article.thumbnail = images[0].replace(/\/\d+px-/, '/300px-');
                }
            } catch (error) {
                console.warn('Error fetching additional images:', error);
                
                article.imagePending = true;
            }
        }

        return article;
    } catch (error) {
        console.warn('Error fetching random article:', error);
        await delay(1000);
        return null;
    }
}

/**
 * Fetches a random article with retry logic
 */
export async function fetchRandomArticle(language: SupportedLanguage): Promise<WikiArticle | null> {
    let attempts = 0;
    const maxAttempts = 3;
    const backoffDelay = 1000; // Delay between retries

    while (attempts < maxAttempts) {
        try {
            const article = await getRandomArticle(language);
            if (article && article.title && article.excerpt) {
                return article;
            }
        } catch (error) {
            console.warn(`Attempt ${attempts + 1}/${maxAttempts} failed:`, error);
            
            await delay(backoffDelay * Math.pow(2, attempts));
        }
        attempts++;
    }

    return null;
}

/**
 * Fetches images for a specific article
 */
export async function fetchArticleImages(articleId: string, language: SupportedLanguage): Promise<{ imageUrl?: string; thumbnail?: string }> {
    try {
        const cached = cacheService.getArticleImages(articleId, language);
        if (cached) return cached;

        const page = await wiki.page(articleId);
        const summary = await page.summary();
        
        const images = {
            imageUrl: summary.thumbnail?.source,
            thumbnail: summary.thumbnail?.source
        };

        cacheService.setArticleImages(articleId, images, language);
        return images;
    } catch (error) {
        console.error('Error fetching article images:', error);
        return {};
    }
}


setInterval(() => {
    const now = Date.now();
    for (const [key, cache] of articleCache.entries()) {
        if (now - cache.timestamp > ARTICLE_CACHE_DURATION) {
            articleCache.delete(key);
        }
    }
}, ARTICLE_CACHE_DURATION);

/**
 * Searches for articles based on a query
 */
export async function searchArticles(query: string, language: SupportedLanguage, limit = 10) {
  try {
    await ensureLanguage(language);
    const results = await wiki.search(query, { limit });
    return Promise.all(
      results.results.map(async result => {
        const summary = await wiki.summary(result.title);
        return convertToArticle(summary, language);
      })
    );
  } catch (error) {
    console.error('Error searching articles:', error);
    return [];
  }
}

/**
 * Fetches metadata for a specific article
 */
export async function fetchArticleMetadata(articleId: string, language: SupportedLanguage): Promise<WikiMetadata | null> {
  try {
    await ensureLanguage(language);
    const pageOptions: PageOptions = {
      preload: true,
      fields: ['summary', 'categories', 'related', 'links', 'infobox']
    };

    const page = await wiki.page(articleId, pageOptions);
    const [summary, categories, related, infobox] = await Promise.all([
      page.summary(),
      page.categories(),
      page.related(),
      page.infobox()
    ]);

    const topics = extractTopicsFromInfobox(infobox);

    return {
      categories,
      topics,
      readingTime: estimateReadingTime(summary.extract),
      popularity: await calculateArticlePopularity(page)
    };
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return null;
  }
}

/**
 * Fetches members of a specific category
 */
export async function fetchCategoryMembers(category: string, language: SupportedLanguage, limit = 10) {
  try {
    await ensureLanguage(language);
    const searchOptions: SearchOptions = {
      limit,
      suggestion: true
    };
    const results = await wiki.search(category, searchOptions);

    const pageOptions: PageOptions = {
      preload: true,
      fields: ['summary']
    };

    return Promise.all(
      results.results.map(async result => {
        const page = await wiki.page(result.pageid, pageOptions);
        const summary = await page.summary();
        return convertToArticle(summary, language);
      })
    );
  } catch (error) {
    console.error('Error fetching category members:', error);
    return [];
  }
}

/**
 * Fetches pages linked from a specific article
 */
export async function fetchLinkedPages(articleId: string, language: SupportedLanguage) {
  try {
    await ensureLanguage(language);
    const page = await wiki.page(articleId);
    const links = await page.links();

    const articles = await Promise.all(
      links.slice(0, 10).map(async link => {
        const summary = await wiki.summary(link);
        return convertToArticle(summary, language);
      })
    );

    return articles;
  } catch (error) {
    console.error('Error fetching linked pages:', error);
    return [];
  }
}

interface CategoryResponse {
    query: {
        pages: {
            [key: string]: {
                categories?: Array<{
                    ns: number;
                    title: string;
                    hidden?: boolean;
                    timestamp?: string;
                }>;
            };
        };
    };
    continue?: {
        clcontinue: string;
    };
}

/**
 * Category Navigation System
 * 
 * This collection of functions helps users explore Wikipedia's vast
 * categorization system, finding related content and building
 * knowledge graphs.
 */

/**
 * Fetches and processes article categories
 * Like a librarian organizing books by topic, this function
 * retrieves and cleans up category information
 */
export async function fetchArticleCategories(pageId: string, language: SupportedLanguage): Promise<string[]> {
    
    const cached = cacheService.getCategories(pageId, language);
    if (cached) return cached;

    const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        prop: 'categories',
        titles: pageId,
        cllimit: '500', 
        clprop: 'hidden|timestamp', 
        clshow: '!hidden', 
        origin: '*'
    });

    const endpoint = `https://${language}.wikipedia.org/w/api.php`;
    let allCategories: string[] = [];
    let continueToken: string | undefined;

    do {
        if (continueToken) {
            params.set('clcontinue', continueToken);
        }

        const response = await fetch(`${endpoint}?${params}`);
        if (!response.ok) throw new Error('Failed to fetch categories');

        const data: CategoryResponse = await response.json();
        
        
        const pages = data.query.pages;
        for (const pageId in pages) {
            const categories = pages[pageId].categories || [];
            allCategories.push(
                ...categories
                    .map(cat => cat.title.replace(/^Category:/, ''))
                    .filter(cat => 
                        !cat.toLowerCase().includes('articles') &&
                        !cat.toLowerCase().includes('pages') &&
                        !cat.toLowerCase().includes('stub') &&
                        !cat.toLowerCase().includes('wikidata')
                    )
            );
        }

        continueToken = data.continue?.clcontinue;
    } while (continueToken);

    
    cacheService.setCategories(pageId, allCategories, language);
    return allCategories;
}

/**
 * Searches for articles within a specific category
 */
export async function searchByCategory(category: string, language: SupportedLanguage, limit = 10): Promise<WikiArticle[]> {
    const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        list: 'categorymembers',
        cmtitle: `Category:${category}`,
        cmlimit: String(limit),
        cmtype: 'page',
        cmnamespace: '0', 
        origin: '*',
        prop: 'extracts|pageimages|info',
        explimit: String(limit),
        exintro: '1',
        piprop: 'thumbnail|original'
    });

    const endpoint = `https://${language}.wikipedia.org/w/api.php`;
    const response = await fetch(`${endpoint}?${params}`);
    if (!response.ok) throw new Error('Failed to fetch category members');

    const data = await response.json();
    const articles: WikiArticle[] = [];

    if (data.query?.categorymembers) {
        for (const member of data.query.categorymembers) {
            try {
                const page = await wiki.page(member.title);
                const summary = await page.summary();
                articles.push({
                  id: String(summary.pageid),
                  title: summary.title,
                  excerpt: summary.extract || '',
                  imageUrl: summary.thumbnail?.source,
                  thumbnail: summary.thumbnail?.source,
                  language,
                  url: summary.content_urls?.desktop?.page,
                  content: summary.extract || '',
                  categories: [category],
                  lastModified: Date.now().toString(),
                  imagePending: false
                });
            } catch (error) {
                console.warn(`Error fetching article ${member.title}:`, error);
            }
        }
    }

    return articles;
}

/**
 * Fetches related categories for a given category
 */
export async function getRelatedCategories(category: string, language: SupportedLanguage): Promise<string[]> {
  try {
    await ensureLanguage(language);
    const categoryTitle = category.startsWith('Category:') ? category : `Category:${category}`;
    
    const endpoint = `https://${language}.wikipedia.org/w/api.php`;
    const params = new URLSearchParams({
      action: 'query',
      prop: 'categories',
      titles: categoryTitle,
      cllimit: '50',
      format: 'json',
      origin: '*'
    });

    const response = await fetch(`${endpoint}?${params}`);
    const data = await response.json();
    
    const pageId = Object.keys(data.query?.pages || {})[0];
    const categories = data.query?.pages[pageId]?.categories || [];
    
    return categories
      .map((cat: any) => cat.title.replace(/^Category:/, ''))
      .filter((cat: string) => 
        !cat.includes('Hidden') && 
        !cat.includes('Wikipedia') && 
        !cat.includes('Articles'));
  } catch (error) {
    console.error('Error fetching related categories:', error);
    return [];
  }
}

/**
 * Converts a WikiSummary to a WikiArticle
 */
function convertToArticle(summary: WikiSummary, language: SupportedLanguage): WikiArticle {
  if (!summary?.pageid || !summary?.title) {
    throw new Error('Invalid summary data');
  }

  return {
  id: String(summary.pageid),
  title: summary.title,
  excerpt: summary.extract || '',
  imageUrl: summary.thumbnail?.source,
  thumbnail: summary.thumbnail?.source,
  language,
  url: summary.content_urls?.desktop?.page || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`,
  content: summary.extract || '',
  lastModified: summary.timestamp,
  imagePending: false
};
}

/**
 * Estimates reading time for a given text
 */
function estimateReadingTime(text: string): number {
  const wordsPerMinute = 200;
  const words = text.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

/**
 * Calculates the popularity of an article
 */
function calculatePopularity(info: any): number {
  
  return 0.5; 
}


function handleWikiError(error: WikiError): never {
  console.error(`Wikipedia API Error: ${error.code} - ${error.info}`);
  throw new Error(error.info);
}

function extractTopicsFromRelated(related: any): string[] {
  
  return [];
}


export type { WikiSummary, WikiError, WikiPage, WikiMetadata };

/**
 * Popularity Calculator
 * 
 * Uses various metrics to determine how "important" or "popular"
 * an article is within Wikipedia's ecosystem:
 * - Number of language versions
 * - Reference count
 * - Internal links
 */
async function calculateArticlePopularity(page: WikiResponse): Promise<number> {
  try {
    const [links, references, langLinks] = await Promise.all([
      page.links({ limit: 100 }),
      page.references({ limit: 100 }),
      page.langLinks()
    ]);

    
    const linkScore = Math.min(1, (links?.length || 0) / 100);
    const refScore = Math.min(1, (references?.length || 0) / 50);
    const langScore = Math.min(1, (langLinks?.length || 0) / 20);

    return (linkScore * 0.4 + refScore * 0.3 + langScore * 0.3);
  } catch {
    return 0.5;
  }
}

/**
 * Topic Extraction System
 * 
 * Analyzes article infoboxes to identify key topics and themes
 * Like a content analyst, it looks for patterns and meaningful categorizations
 */
function extractTopicsFromInfobox(infobox: Infobox): string[] {
  if (!infobox) return [];

  const relevantFields = ['genre', 'field', 'subject', 'category', 'type'];
  const topics = new Set<string>();

  for (const field of relevantFields) {
    const value = infobox[field];
    if (value) {
      const values = Array.isArray(value)
        ? value
        : [typeof value === 'object' ? value.value : value];
      values.forEach(v => topics.add(String(v).toLowerCase()));
    }
  }

  return Array.from(topics);
}