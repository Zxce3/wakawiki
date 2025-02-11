/**
 * Recommendations Worker
 * 
 * This worker generates article recommendations based on user interactions and preferences.
 * It handles fetching metadata, processing categories, and caching recommendations.
 */

import wiki from 'wikipedia';
import type {
    ArticleRecommendation,
    UserPreferences,
    WikiArticle,
    FeedbackWeights,
    LocalUserInteraction,
} from '../types';
import {
    fetchArticleMetadata,
    fetchRandomArticle,
    searchByCategory, 
    getRelatedCategories 
} from '../api/wikipedia';
import type { SupportedLanguage } from '../types';

const recentRecommendations = new Map<string, number>();
const RECOMMENDATION_COOLDOWN = 1000 * 60 * 30; // Cooldown period for recommendations
const seenArticles = new Set<string>();
const userPreferences: UserPreferences = {
    categories: new Map(),
    languages: new Map(),
    topics: new Map(),
    readingTime: { min: Infinity, max: 0 },
    dislikedCategories: new Map(),
    preferredTopics: new Map(),
    feedbackHistory: []
};

const articleMetadata = new Map<string, {
    categories: string[];
    topics: string[];
    readingTime: number;
    popularity: number;
}>();

const categoryInteractions = new Map<string, {
    count: number;
    lastUsed: number;
    articles: Set<string>;
}>();

const recommendationCache = new Map<string, {
    recommendations: ArticleRecommendation[];
    timestamp: number;
    language: SupportedLanguage;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // Cache duration for recommendations

console.log('Web Worker: Initializing recommendations worker');

type WorkerMessage = 
    | { type: 'initialize'; categories: string[]; language: SupportedLanguage }
    | LocalUserInteraction[];

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    try {
        if (Array.isArray(event.data)) {
            // Handle user interactions
            const interactions = event.data;
            if (interactions.length === 0) {
                console.log('No interactions provided');
                self.postMessage([]);
                return;
            }

            const language = interactions[0].language;
            console.log('Processing recommendations for language:', language);
            await wiki.setLang(language);
            const recommendations = await generateRecommendations(interactions);
            console.log('Generated recommendations:', recommendations);
            self.postMessage(recommendations);
        } 
        else if (event.data.type === 'initialize') {
            // Handle initialization with liked categories
            const { categories, language } = event.data;
            if (categories.length > 0) {
                console.log('Initializing with liked categories:', categories);
                await wiki.setLang(language);
                const recommendations = await generateCategoryBasedRecommendations(categories, language);
                self.postMessage(recommendations);
            }
        }
    } catch (error) {
        console.error('Error in worker:', error);
        self.postMessage([]);
    }
};

/**
 * Filters out recently recommended articles to avoid repetition.
 */
function filterRecentRecommendations(recommendations: ArticleRecommendation[]): ArticleRecommendation[] {
    const now = Date.now();
    const activeRecommendations = new Set<string>();

    // Check cache for active recommendations
    for (const [key, cache] of recommendationCache.entries()) {
        if (now - cache.timestamp < CACHE_DURATION) {
            cache.recommendations.forEach(rec => activeRecommendations.add(rec.articleId));
        } else {
            recommendationCache.delete(key);
        }
    }

    // Filter out recent recommendations
    return recommendations.filter(rec => {
        if (recentRecommendations.has(rec.articleId) || activeRecommendations.has(rec.articleId)) {
            return false;
        }
        recentRecommendations.set(rec.articleId, now);
        return true;
    });
}

/**
 * Deduplicates user interactions to ensure unique processing.
 */
function deduplicateInteractions(interactions: LocalUserInteraction[]): LocalUserInteraction[] {
    const unique = new Map<string, LocalUserInteraction>();
    interactions
        .sort((a, b) => b.timestamp - a.timestamp)
        .forEach(interaction => {
            if ((interaction as any).processed) return; // Skip already processed interactions
            if (!unique.has(interaction.articleId)) {
                unique.set(interaction.articleId, interaction);
            }
        });
    return Array.from(unique.values());
}

/**
 * Generates article recommendations based on user interactions.
 */
async function generateRecommendations(interactions: LocalUserInteraction[]): Promise<ArticleRecommendation[]> {
    try {
        const language = interactions[0].language;
        
        const recommendations = await generateRecommendationsFromInteractions(interactions);
        
        // Sort and limit recommendations
        return recommendations
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
    } catch (error) {
        console.error('Error in generateRecommendations:', error);
        return [];
    }
}

const weights: FeedbackWeights = {
    category: 0.4,    
    topic: 0.2,
    readingTime: 0.1,
    language: 0.2,
    recency: 0.1,
    popularity: 0.1,
    userFeedback: 0.5 
};

/**
 * Cleans and filters relevant categories.
 */
function getRelevantCategories(categories: string[]): string[] {
    return categories
        .map(cleanCategory)
        .filter(cat => 
            cat && 
            !cat.toLowerCase().includes('wikidata') &&
            !cat.toLowerCase().includes('hidden')
        );
}

/**
 * Generates recommendations from user interactions.
 */
async function generateRecommendationsFromInteractions(interactions: LocalUserInteraction[]): Promise<ArticleRecommendation[]> {
    if (interactions.length === 0) return [];

    const recommendations = new Set<ArticleRecommendation>();
    const processedArticles = new Set<string>();

    // Process top 5 interactions
    for (const interaction of interactions.slice(0, 5)) { 
        try {
            const page = await wiki.page(interaction.articleId);
            const categories = await page.categories();
            
            const relevantCategories = categories
                .map(cleanCategory)
                .filter(cat => 
                    cat && 
                    !cat.toLowerCase().includes('wikidata') &&
                    !cat.toLowerCase().includes('hidden')
                );

            console.log('Processing article:', interaction.articleId);
            console.log('Using categories:', relevantCategories);

            for (const category of relevantCategories) {
                if (recommendations.size >= 10) break;

                try {
                    const categoryArticles = await searchByCategory(category, interaction.language, 2);
                    
                    for (const article of categoryArticles) {
                        if (processedArticles.has(article.id)) continue;
                        if (article.id === interaction.articleId) continue; // Skip the same article
                        
                        if (!isValidArticle(article)) continue;
                        
                        processedArticles.add(article.id);
                        
                        recommendations.add({
                            articleId: article.id,
                            score: interaction.type === 'like' ? 0.9 : 0.7,
                            metadata: {
                                title: article.title,
                                categories: [category],
                                excerpt: article.excerpt || '',
                                thumbnail: article.thumbnail,
                                readingTime: estimateReadingTime(article.content || ''),
                                popularity: 0.7
                            },
                            reason: interaction.type === 'like' 
                                ? `Based on article you liked: ${category}`
                                : `Similar to what you're reading: ${category}`
                        });
                    }
                } catch (error) {
                    console.warn(`Error processing category ${category}:`, error);
                    continue;
                }
            }
        } catch (error) {
            console.warn('Error processing article:', error);
            continue;
        }
    }

    // Fallback recommendations if not enough generated
    if (recommendations.size < 3) {
        const fallbackRecs = await getFallbackRecommendations(interactions[0].language);
        for (const rec of fallbackRecs) {
            if (recommendations.size >= 10) break;
            if (!processedArticles.has(rec.articleId)) {
                recommendations.add(rec);
            }
        }
    }

    console.log('Generated recommendations count:', recommendations.size);
    return Array.from(recommendations);
}

/**
 * Calculates the recommendation score based on various factors.
 */
function calculateRecommendationScore(
    summary: any,
    sourceCategories: string[],
    targetCategories: string[]
): number {
    let score = 0;

    if (!summary?.extract) return 0;
    
    score += Math.min(1, summary.extract.length / 1000) * 0.3;
    score += summary.thumbnail ? 0.2 : 0;
    
    const categoryOverlap = sourceCategories.length > 0 ? 
        calculateCategoryOverlap(sourceCategories, targetCategories) : 0.5;
    score += categoryOverlap * 0.5;

    if (summary.extract.length < 100 || !summary.title) {
        score *= 0.5;
    }

    return Math.max(0, Math.min(1, score));
}

/**
 * Retrieves the top 10 recommended articles, sorted by score.
 */
function getTopRecommendations(articleScores: Map<string, { score: number; metadata: ArticleRecommendation['metadata'] }>, interactions: LocalUserInteraction[]): ArticleRecommendation[] {
    if (articleScores.size === 0) {
        console.log('No recommendations found');
        return [];
    }

    const sorted = Array.from(articleScores.entries())
        .sort(([, a], [, b]) => b.score - a.score)
        .slice(0, 10);

    return sorted.map(([articleId, { score, metadata }]) => ({
        articleId,
        score,
        metadata,
        reason: generateReason(articleId, interactions, score, metadata)
    }));
}

/**
 * Generates a recommendation reason for an article based on its score and interaction.
 */
function generateReason(articleId: string, interactions: LocalUserInteraction[], score: number, metadata: ArticleRecommendation['metadata']): string {
    const articleInteractions = interactions.filter(i => i.articleId === articleId);
    const interactionType = articleInteractions[0]?.type;

    if (metadata.categories?.length) {
        return `Based on category: ${metadata.categories[0]}`;
    } else if (score < 0.9 && score >= 0.7) {
        return 'Similar to articles you like';
    } else if (score < 0.7) {
        return 'You might find this interesting';
    }

    return interactionType === 'like'
        ? 'Based on your likes'
        : 'Based on your reading history';
}

/**
 * Updates user preferences based on interactions.
 */
function updateUserPreferences(interactions: LocalUserInteraction[]): void {
    interactions.forEach(interaction => {
        const metadata = articleMetadata.get(interaction.articleId);
        if (!metadata) return;
        metadata.categories.forEach(category => {
            const current = userPreferences.categories.get(category) || 0;
            userPreferences.categories.set(category, current + (interaction.type === 'like' ? 2 : 1));
        });
        const langWeight = userPreferences.languages.get(interaction.language) || 0;
        userPreferences.languages.set(interaction.language, langWeight + 1);
        userPreferences.readingTime.min = Math.min(userPreferences.readingTime.min, metadata.readingTime);
        userPreferences.readingTime.max = Math.max(userPreferences.readingTime.max, metadata.readingTime);
    });
}

/**
 * Fetches a set of random articles that have images.
 */
async function fetchRandomArticlesWithImages(language: SupportedLanguage, count: number, excludeIds: Set<string>): Promise<WikiArticle[]> {
    const articles: WikiArticle[] = [];
    let attempts = 0;
    const maxAttempts = count * 3;
    while (articles.length < count && attempts < maxAttempts) {
        try {
            const article = await fetchRandomArticle(language);
            if (article && !excludeIds.has(article.id)) {
                articles.push(article);
                excludeIds.add(article.id);
            }
        } catch (error) {
            console.error('Error fetching random article:', error);
        }
        attempts++;
    }
    return articles;
}

/**
 * Fetches categories for a specific article.
 */
async function fetchArticleCategories(articleId: string, language: SupportedLanguage): Promise<string[]> {
    try {
        const metadata = await fetchArticleMetadata(articleId, language);
        return metadata?.categories || [];
    } catch (error) {
        console.error(`Error fetching categories for article ${articleId}:`, error);
        return [];
    }
}

/**
 * Calculates the popularity of an article.
 */
function calculateArticlePopularity(result: any): number | undefined {
    if (!result) return undefined;

    let score = 0;

    if (result.pageid) {
        score += 0.3;
    }

    if (result.thumbnail) {
        score += 0.2;
    }

    if (result.description) {
        score += Math.min(0.3, result.description.length / 1000);
    }

    if (result.size) {
        score += Math.min(0.2, result.size / 50000);
    }

    return Math.min(1, score);
}

/**
 * Provides fallback recommendations if not enough recommendations are generated.
 */
async function getFallbackRecommendations(language: SupportedLanguage): Promise<ArticleRecommendation[]> {
    try {
        const articles = await fetchRandomArticlesWithImages(language, 5, new Set());
        
        return articles.map(article => ({
            articleId: article.id,
            score: 0.5, 
            metadata: {
                title: article.title,
                categories: article.categories || [],
                excerpt: article.excerpt || '',
                thumbnail: article.thumbnail,
                readingTime: estimateReadingTime(article.content || ''),
                popularity: 0.5
            },
            reason: 'You might find this interesting'
        }));
    } catch (error) {
        console.error('Error getting fallback recommendations:', error);
        return [];
    }
}

/**
 * Estimates reading time for a given text.
 */
function estimateReadingTime(extract: string): number | undefined {
    if (!extract) return undefined;
    
    const WORDS_PER_MINUTE = 200;
    const wordCount = extract.trim().split(/\s+/).length;
    const minutes = Math.round((wordCount / WORDS_PER_MINUTE) * 2) / 2;
    
    return Math.max(0.5, minutes);
}

/**
 * Calculates the overlap between source and target categories.
 */
function calculateCategoryOverlap(sourceCategories: string[], targetCategories: string[]): number {
    if (!sourceCategories.length || !targetCategories.length) {
        return 0;
    }

    const sourceCats = sourceCategories.map(c => c.toLowerCase());
    const targetCats = targetCategories.map(c => c.toLowerCase());

    const exactMatches = sourceCats.filter(cat => targetCats.includes(cat)).length;
    const partialMatches = sourceCats.filter(sCat => 
        targetCats.some(tCat => 
            tCat.includes(sCat) || sCat.includes(tCat)
        )
    ).length;

    const maxPossibleMatches = Math.min(sourceCats.length, targetCats.length);
    const overlapScore = (exactMatches + partialMatches * 0.5) / maxPossibleMatches;

    return Math.min(1, overlapScore);
}

/**
 * Searches for articles within multiple categories.
 */
async function searchByCategories(categories: string[], language: SupportedLanguage, limit = 5): Promise<WikiArticle[]> {
    const articles = new Map<string, WikiArticle>();
    
    for (const category of categories) {
        if (articles.size >= limit) break;
        
        try {
            const cleanedCategory = cleanCategory(category);
            if (!cleanedCategory) continue;

            const categoryArticles = await searchByCategory(cleanedCategory, language, Math.ceil(limit / 2));
            for (const article of categoryArticles) {
                if (!articles.has(article.id) && isArticleValid(article)) {
                    articles.set(article.id, article);
                }
            }
        } catch (error) {
            console.warn(`Error searching category ${category}:`, error);
        }
    }
    
    return Array.from(articles.values()).slice(0, limit);
}

/**
 * Validates if an article is suitable for recommendations.
 */
function isArticleValid(article: WikiArticle): boolean {
    if (!article.title || !article.excerpt) {
        return false;
    }
    return (
        article.excerpt.length >= 100 &&
        !article.title.includes(':') &&
        !article.title.match(/^\d+/) &&
        !article.title.includes('List of')
    );
}

/**
 * Cleans category names by removing unwanted parts.
 */
function cleanCategory(category: string): string {
    if (!category) return '';
    
    return category
        .replace(/^(Category:|Kategori:)/, '')
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/articles?|pages?/gi, '')
        .replace(/^CS1|^Use\s+\w+\s+dates?/i, '')
        .replace(/with\s+\w+\s+identifiers?/i, '')
        .replace(/\b(stub|artikel|halaman)\b/gi, '')
        .replace(/^[0-9]+\s+/, '')
        .trim();
}

/**
 * Generates recommendations based on liked categories.
 */
async function generateCategoryBasedRecommendations(
    categories: string[],
    language: SupportedLanguage
): Promise<ArticleRecommendation[]> {
    const recommendations = new Set<ArticleRecommendation>();
    const processedArticles = new Set<string>();

    for (const category of categories) {
        if (recommendations.size >= 10) break;

        try {
            const categoryArticles = await searchByCategory(category, language, 3);
            
            for (const article of categoryArticles) {
                if (processedArticles.has(article.id)) continue;
                processedArticles.add(article.id);
                
                recommendations.add({
                    articleId: article.id,
                    score: 0.9, 
                    metadata: {
                        title: article.title,
                        categories: [category],
                        excerpt: article.excerpt || '',
                        thumbnail: article.thumbnail,
                        readingTime: estimateReadingTime(article.content || ''),
                        popularity: 0.8
                    },
                    reason: `Based on articles you like in ${category}`
                });
            }
        } catch (error) {
            console.warn(`Error processing category ${category}:`, error);
            continue;
        }
    }

    return Array.from(recommendations)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
}

/**
 * Validates if an article is suitable for recommendations.
 */
function isValidArticle(article: WikiArticle): boolean {
    if (!article.title || !article.excerpt) return false;
    if (article.excerpt.length < 100) return false;
    if (article.title.includes(':')) return false;
    if (/^\d+/.test(article.title)) return false;
    if (article.title.includes('List of')) return false;
    return true;
}

