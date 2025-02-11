import { fetchRandomArticle } from '$lib/api/wikipedia';
import type { SupportedLanguage, WikiArticle } from '$lib/types';
import { getBrowserLanguage } from '$lib/storage/utils';
import { error } from '@sveltejs/kit';

const INITIAL_ARTICLES_COUNT = 6; 

export async function load() {
    try {
        const initialLanguage = getBrowserLanguage() as SupportedLanguage;
        const articles: WikiArticle[] = [];
        
        
        for (let i = 0; i < INITIAL_ARTICLES_COUNT; i++) {
            try {
                const article = await fetchRandomArticle(initialLanguage);
                if (article) {
                    articles.push(article);
                }
            } catch (err) {
                console.warn(`Failed to load article ${i + 1}:`, err);
            }
        }

        if (articles.length === 0) {
            throw error(500, 'Failed to load initial articles');
        }

        return {
            initialLanguage,
            initialArticles: articles
        };
    } catch (err) {
        console.error('Error loading page:', err);
        throw error(500, 'Failed to load page data');
    }
}