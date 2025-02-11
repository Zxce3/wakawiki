/**
 * Article Fetcher Worker
 * 
 * This worker fetches articles based on different criteria such as recommendations,
 * random selection, or specific categories. It handles fetching and filtering articles.
 */

import wiki from 'wikipedia';
import type { WikiArticle, ArticleRecommendation, SupportedLanguage } from '../types';
import { searchByCategory, fetchRandomArticle } from '../api/wikipedia';

interface FetchRequest {
  type: 'recommendations' | 'random' | 'category';
  language: SupportedLanguage;
  recommendations?: ArticleRecommendation[];
  likedArticleIds?: string[];
  category?: string;
  count?: number;
}

self.onmessage = async (event: MessageEvent<FetchRequest>) => {
  const { type, language, recommendations, likedArticleIds = [], category, count = 3 } = event.data;
  const excludeIds = new Set(likedArticleIds);
  
  try {
    await wiki.setLang(language);
    const articles: WikiArticle[] = [];
    
    if (type === 'category' && category) {
      // Fetch articles by category
      const categoryArticles = await searchByCategory(category, language, count);
      articles.push(...categoryArticles.filter(article => !excludeIds.has(article.id)));
    } else if (type === 'recommendations' && recommendations?.length) {
      // Fetch recommended articles
      for (const rec of recommendations) {
        if (articles.length >= count) break;
        try {
          const page = await wiki.page(rec.articleId, { preload: true, fields: ['summary'] });
          const summary = await page.summary();
          articles.push(convertToArticle(summary, language));
        } catch (error) {
          console.error('Error fetching recommended article:', error);
        }
      }
    } else {
      // Fetch random articles
      while (articles.length < count) {
        try {
          const randomResult = await wiki.random();
          const pageTitle = extractPageTitle(randomResult);
          
          if (!pageTitle) continue;

          const page = await wiki.page(pageTitle, { preload: true, fields: ['summary'] });
          const summary = await page.summary();
          const article = convertToArticle(summary, language);
          
          if (!excludeIds.has(article.id)) {
            articles.push(article);
          }
        } catch (error) {
          console.error('Error fetching random article:', error);
        }
      }
    }

    // Ensure we have enough articles
    while (articles.length < count) {
      try {
        const article = await fetchRandomArticle(language);
        if (article && !excludeIds.has(article.id)) {
          articles.push(article);
        }
      } catch (error) {
        console.warn('Error fetching random article:', error);
      }
    }

    self.postMessage({ 
      success: true, 
      articles: articles.slice(0, count)
    });
  } catch (error) {
    self.postMessage({ 
      success: false, 
      error: (error as Error).message 
    });
  }
};

/**
 * Fetches a random article with retry logic.
 */
async function fetchRandomArticleWithRetry(language: SupportedLanguage): Promise<WikiArticle | null> {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const article = await fetchRandomArticle(language);
      if (article && article.imageUrl) {
        return article;
      }
    } catch (error) {
      console.warn(`Retry ${i + 1}/${maxRetries} failed:`, error);
    }
  }
  return null;
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

/**
 * Converts a summary to a WikiArticle.
 */
function convertToArticle(summary: any, language: string): WikiArticle {
  return {
    id: String(summary.pageid),
    title: summary.title,
    excerpt: summary.extract,
    imageUrl: summary.thumbnail?.source,
    thumbnail: summary.thumbnail?.source,
    language,
    url: summary.content_urls.desktop.page,
    content: summary.extract,
    lastModified: summary.timestamp,
    imagePending: false
  };
}
