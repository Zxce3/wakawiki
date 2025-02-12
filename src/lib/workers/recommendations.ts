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
    SupportedLanguage
} from '$lib/types';
import {
    fetchArticleMetadata,
    fetchRandomArticle,
    searchByCategory as searchByCategoryApi,
    getRelatedCategories
} from '$lib/api/wikipedia';
import { cacheService } from '$lib/services/cacheService';

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

let currentWorkerLanguage: SupportedLanguage = 'en';

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    try {
        if (Array.isArray(event.data)) {
            const interactions = event.data;
            if (interactions.length === 0) {
                return;
            }

            const language = interactions[0].language as SupportedLanguage;
            if (currentWorkerLanguage !== language) {
                currentWorkerLanguage = language;
                wiki.setLang(language);
                recommendationCache.clear();
            }

            console.log(`Processing recommendations for language: ${language}`);
            const recommendations = await generateRecommendations(interactions);
            self.postMessage(recommendations);
        }
        else if (event.data.type === 'initialize') {
            const { categories, language } = event.data;
            currentWorkerLanguage = language;
            wiki.setLang(language);
            recommendationCache.clear();

            if (categories.length > 0) {
                console.log('Initializing with liked categories:', categories);
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
 * Enhanced recommendation generation with smart cache utilization
 */
async function generateRecommendations(interactions: LocalUserInteraction[]): Promise<ArticleRecommendation[]> {
    try {
        const language = interactions[0].language;
        const userId = String(interactions[0].userId || 'anonymous');
        const cacheKey = `${userId}-${Date.now()}`;

        // Try to get from various caches
        const [cachedRecommendations, fallbackCache] = await Promise.all([
            cacheService.getRecommendations(cacheKey, language),
            cacheService.getRecommendations('fallback-' + language, language)
        ]);

        // Use cached recommendations if they're fresh and relevant
        if (Array.isArray(cachedRecommendations) && cachedRecommendations.length >= 5) {
            const stillRelevant = cachedRecommendations.some(rec => 
                interactions.some(i => i.articleId === rec.articleId)
            );
            
            if (stillRelevant) {
                console.log('Using relevant cached recommendations');
                return cachedRecommendations;
            }
        }

        // Generate new recommendations
        let recommendations = await generateRecommendationsFromInteractions(interactions);
        
        // If we don't have enough recommendations, mix in some cached ones
        if (recommendations.length < 5 && fallbackCache) {
            const uniqueRecommendations = new Map(
                recommendations.map(r => [r.articleId, r])
            );

            // Add relevant fallback recommendations
            fallbackCache.forEach(rec => {
                if (!uniqueRecommendations.has(rec.articleId)) {
                    uniqueRecommendations.set(rec.articleId, {
                        ...rec,
                        score: rec.score * 0.8, // Reduce score for cached recommendations
                        reason: 'You might also like this'
                    });
                }
            });

            recommendations = Array.from(uniqueRecommendations.values());
        }

        // Sort and limit recommendations
        const sortedRecs = recommendations
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        // Cache both user-specific and fallback recommendations
        await Promise.all([
            cacheService.setRecommendations(cacheKey, sortedRecs, language),
            cacheService.setRecommendations('fallback-' + language, sortedRecs, language)
        ]);

        return sortedRecs;
    } catch (error) {
        console.error('Error in generateRecommendations:', error);
        return getFallbackRecommendations(interactions[0].language);
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
 * Enhanced recommendation generation with better error handling
 */
async function generateRecommendationsFromInteractions(interactions: LocalUserInteraction[]): Promise<ArticleRecommendation[]> {
    if (interactions.length === 0) return [];

    const recommendations = new Set<ArticleRecommendation>();
    const processedArticles = new Set<string>();
    let errorCount = 0;

    // Process top 5 recent interactions
    for (const interaction of interactions.slice(0, 5)) {
        try {
            // Try to get categories from cache first
            const cachedCategories = await cacheService.getCategories(interaction.articleId, interaction.language);
            
            let categories: string[] = [];
            if (cachedCategories) {
                categories = cachedCategories;
            } else {
                try {
                    // Fetch page info directly using the API to avoid CORS
                    const page = await wiki.page(interaction.articleId);
                    categories = await page.categories().catch(() => []);
                    if (categories.length > 0) {
                        await cacheService.setCategories(interaction.articleId, categories, interaction.language);
                    }
                } catch (error) {
                    console.warn(`Failed to fetch categories for ${interaction.articleId}:`, error);
                    continue;
                }
            }

            const relevantCategories = getRelevantCategories(categories);
            if (relevantCategories.length === 0) continue;

            // Process each category
            for (const category of relevantCategories) {
                if (recommendations.size >= 10) break;

                try {
                    const categoryArticles = await searchByCategoryApi(category, interaction.language, 2)
                        .catch(() => []);

                    for (const article of categoryArticles) {
                        if (!article || processedArticles.has(article.id) || 
                            article.id === interaction.articleId || 
                            !isValidArticle(article)) continue;

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
                    errorCount++;
                }
            }
        } catch (error) {
            console.warn('Error processing interaction:', error);
            errorCount++;
        }

        // Break early if we have enough recommendations
        if (recommendations.size >= 10) break;
    }

    // If we have too many errors or too few recommendations, get fallbacks
    if (errorCount > 2 || recommendations.size < 3) {
        const fallbackRecs = await getFallbackRecommendations(interactions[0].language);
        for (const rec of fallbackRecs) {
            if (recommendations.size >= 10) break;
            if (!processedArticles.has(rec.articleId)) {
                recommendations.add(rec);
            }
        }
    }

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
 * Enhanced fallback recommendations
 */
async function getFallbackRecommendations(language: SupportedLanguage): Promise<ArticleRecommendation[]> {
    try {
        // Try to get cached fallbacks first
        const cached = await cacheService.getRecommendations('fallback-' + language, language);
        if (Array.isArray(cached) && cached.length >= 5) {
            return cached;
        }

        // Get a mix of different types of articles
        const [popularArticles, featuredArticles, randomArticles] = await Promise.all([
            fetchRandomArticlesWithImages(language, 3, new Set()),
            searchByCategoryApi('Featured_articles', language, 3),
            fetchRandomArticlesWithImages(language, 4, new Set())
        ]);

        const recommendations: ArticleRecommendation[] = [
            ...popularArticles.map(article => ({
                articleId: article.id,
                score: 0.7,
                metadata: {
                    title: article.title,
                    categories: article.categories || [],
                    excerpt: article.excerpt || '',
                    thumbnail: article.thumbnail,
                    readingTime: estimateReadingTime(article.content || ''),
                    popularity: 0.8
                },
                reason: 'Popular article you might enjoy'
            })),
            ...featuredArticles.map(article => ({
                articleId: article.id,
                score: 0.8,
                metadata: {
                    title: article.title,
                    categories: article.categories || [],
                    excerpt: article.excerpt || '',
                    thumbnail: article.thumbnail,
                    readingTime: estimateReadingTime(article.content || ''),
                    popularity: 0.9
                },
                reason: 'Featured article'
            })),
            ...randomArticles.map(article => ({
                articleId: article.id,
                score: 0.6,
                metadata: {
                    title: article.title,
                    categories: article.categories || [],
                    excerpt: article.excerpt || '',
                    thumbnail: article.thumbnail,
                    readingTime: estimateReadingTime(article.content || ''),
                    popularity: 0.5
                },
                reason: 'You might find this interesting'
            }))
        ];

        // Cache these fallback recommendations
        await cacheService.setRecommendations('fallback-' + language, recommendations, language);

        return recommendations;
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

            const categoryArticles = await searchByCategoryApi(cleanedCategory, language, Math.ceil(limit / 2));
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
    const cacheKey = `categories-${categories.join('-')}`;
    
    // Try to get from cache first
    const cached = await cacheService.getRecommendations(cacheKey, language);
    if (cached && cached.length > 0) {
        return cached;
    }

    const recommendations = new Set<ArticleRecommendation>();
    const processedArticles = new Set<string>();

    for (const category of categories) {
        if (recommendations.size >= 10) break;

        try {
            const categoryArticles = await searchByCategoryApi(category, language, 3);

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

    const sortedRecs = Array.from(recommendations)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    // Cache the results
    await cacheService.setRecommendations(cacheKey, sortedRecs, language);

    return sortedRecs;
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

