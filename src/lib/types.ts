export interface WikiArticle {
    [x: string]: any;
    imagePending: boolean;
    id: string;
    title: string;
    excerpt?: string;
    imageUrl?: string;
    thumbnail?: string;
    language: string;
    url: string;
    content?: string;
    categories?: string[];
    topics?: string[];
    readingTime?: number;
    lastModified?: string;
    popularity?: number;
}

export interface UserInteraction {
    articleId: string;
    timestamp: number;
    type: 'view' | 'like';
    language: string;
}

export interface ArticleRecommendation {
    articleId: string;
    score: number;
    reason: string;
    metadata: {
        title: string;
        categories: string[];
        excerpt: string;
        thumbnail?: string;
        readingTime?: number;
        popularity?: number;
    };
}

export type SupportedLanguage =
    'en' | 'es' | 'fr' | 'de' | 'zh' |
    'ja' | 'ko' | 'ru' | 'it' | 'pt' |
    'ar' | 'hi' | 'nl' | 'pl' | 'id';


export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
    return ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'ru', 'it', 'pt', 'ar', 'hi', 'nl', 'pl', 'id'].includes(lang);
}

export interface ArticleCategory {
    title: string;
    weight: number;
}

export interface UserPreferences {
    categories: Map<string, number>;
    languages: Map<string, number>;
    topics: Map<string, number>;
    readingTime: {
        min: number;
        max: number;
    };
    dislikedCategories: Map<string, number>;
    preferredTopics: Map<string, number>;
    feedbackHistory: ArticleFeedback[];
}

export interface WikiPage {
    pageid: number;
    ns: number;
    title: string;
    contentmodel: string;
    pagelanguage: string;
    pagelanguagehtmlcode: string;
    pagelanguagedir: string;
    touched: string;
    lastrevid: number;
    length: number;
    fullurl: string;
    editurl: string;
    canonicalurl: string;
    revisions?: [{
        revid: number;
        parentid: number;
        user: string;
        timestamp: string;
        comment: string;
    }];
    categories?: string[];
    images?: string[];
    coordinates?: {
        lat: number;
        lon: number;
        primary: string;
        globe: string;
    };
}

export interface WikiSearchResult {
    pageid: number;
    ns: number;
    title: string;
    size: number;
    wordcount: number;
    snippet: string;
    timestamp: string;
    titlesnippet?: string;
    categorysnippet?: string;
    score?: number;
}

export interface WikiApiResponse {
    pages?: {
        [key: string]: WikiPage;
    };
    search?: WikiSearchResult[];
}

export interface MediaWikiError {
    code: string;
    info: string;
    '*': string;
}

export interface MediaWikiResponse {
    batchcomplete?: boolean;
    continue?: {
        [key: string]: string;
    };
    warnings?: {
        [key: string]: {
            warnings: string;
        };
    };
    error?: MediaWikiError;
    query: WikiApiResponse;
}

export interface WikiQueryParams {
    action: string;
    format: 'json';
    origin: '*';
    formatversion?: '2';
    errorformat?: 'plaintext' | 'wikitext' | 'html' | 'raw' | 'none';
    uselang?: SupportedLanguage;
    [key: string]: string | undefined;
}

export interface LikedArticle {
    id: string;
    timestamp: number;
    article: WikiArticle;
}

export type FeedbackType = 'like' | 'dislike' | 'more_like_this' | 'not_interested';

export interface ArticleFeedback {
    articleId: string;
    feedbackType: FeedbackType;
    timestamp: number;
    categories?: string[];
    topics?: string[];
    language: SupportedLanguage;
}


export interface ScoringWeights {
    category: number;
    topic: number;
    readingTime: number;
    language: number;
    recency: number;
    popularity: number;
}

export interface FeedbackWeights extends ScoringWeights {
    userFeedback: number;
}


export interface LocalUserInteraction {
    [x: string]: string | number;
    articleId: string;
    type: 'view' | 'like';
    timestamp: number;
    language: SupportedLanguage;
}


export interface WikiSummary {
    [x: string]: any;
    type: string;
    title: string;
    displaytitle: string;
    namespace: { id: number; text: string };
    wikibase_item: string;
    titles: { 
        canonical: string;
        normalized: string;
        display: string 
    };
    pageid: number;
    thumbnail?: {
        source: string;
        width: number;
        height: number;
    };
    originalimage?: {
        source: string;
        width: number;
        height: number;
    };
    lang: string;
    dir: string;
    revision: string;
    tid: string;
    timestamp: string;
    description?: string;
    description_source?: string;
    content_urls: {
        desktop: {
            page: string;
            revisions: string;
            edit: string;
            talk: string;
        };
        mobile: {
            page: string;
            revisions: string;
            edit: string;
            talk: string;
        };
    };
    extract: string;
    extract_html: string;
}

export interface ImageResult {
    pageid: number;
    ns: number;
    title: string;
    imagerepository: string;
    imageinfo: any;
    url: string;
}

export interface CoordinatesResult {
    lat: number;
    lon: number;
    primary: string;
    globe: string;
}

export interface LangLinksResult {
    lang: string;
    title: string;
    url: string;
}


export interface LanguageResult {
    [key: string]: string;
}


export interface WikiResponse {
    [key: string]: any;
    pageid?: number;
    title?: string;
    lang?: string;
}

export interface WikiSearchResult extends MediaWikiResponse {
    results: any[];
    suggestion?: string;
}

export interface GeoSearchResult {
    pageid: number;
    ns: number;
    title: string;
    lat: number;
    lon: number;
    dist: number;
    primary: string;
    type: string;
}

export interface WikiMediaResult {
    revision: string;
    tid: string;
    items: MediaResult[];
}

export interface MediaResult {
    title: string;
    section_id: number;
    type: string;
    caption?: {
        html: string;
        text: string;
    };
    showInGallery: boolean;
    srcset: SrcResult[];
}

interface SrcResult {
    src: string;
    scale: string;
}

export interface EventResult {
    births?: EventItem[];
    deaths?: EventItem[];
    events?: EventItem[];
    holidays?: HolidayItem[];
    selected?: EventItem[];
}

interface EventItem {
    text: string;
    pages: WikiSummary[];
    year?: number;
}

interface HolidayItem {
    text: string;
    pages: WikiSummary[];
}

export interface FeaturedContentResult {
    tfa: WikiSummary;
    mostread: {
        date: string;
        articles: WikiSummary[];
    };
    image: {
        title: string;
        thumbnail: ImageDimensions;
        image: ImageDimensions;
        file_page: string;
        artist: any;
        credit: string;
        license: {
            type: string;
            code: string;
        };
        description: any;
        wb_entity_id: string;
        structured: {
            captions: {
                [key: string]: string;
            };
        };
    };
    news: NewsItem[];
    onthisday: EventItem[];
}

interface ImageDimensions {
    source: string;
    width: number;
    height: number;
}

interface NewsItem {
    links: WikiSummary[];
    story: string;
}

export interface RelatedResult {
    pages: WikiSummary[];
}

export interface TitleItem {
    title: string;
    page_id: number;
    rev: number;
    tid: number;
    namespace: number;
    user_id: number;
    user_text: string;
    timestamp: string;
    comment: string;
    tags: string[];
    restrictions: string[];
    page_language: string;
    redirect: boolean;
}

export interface Title {
    items: TitleItem[];
}

export interface MobileSections {
    lead: {
        ns: number;
        id: number;
        revision: string;
        lastmodified: string;
        lastmodifier: {
            user: string;
            gender: string;
        };
        displaytitle: string;
        normalizedtitle: string;
        wikibase_item: string;
        description?: string;
        description_source?: string;
        protection: Record<string, unknown>;
        editable: boolean;
        languagecount: number;
        image?: {
            file: string;
            urls: {
                [key: string]: string;
            };
        };
        issues?: string[];
        geo?: {
            latitude: string;
            longitude: string;
        };
        sections: Section[];
    };
    remaining: {
        sections: Section[];
    };
}

interface Section {
    id: number;
    text: string;
    toclevel: number;
    line: string;
    anchor: string;
}

export interface WikiError {
    code: string;
    info: string;
    docref: string;
}


export type PageFunctions = 'summary' | 'images' | 'intro' | 'html' | 'content' | 
    'categories' | 'links' | 'references' | 'coordinates' | 'langLinks' | 
    'infobox' | 'tables' | 'related';

export interface PageOptions {
    autoSuggest?: boolean;
    redirect?: boolean;
    preload?: boolean;
    fields?: Array<PageFunctions>;
}

export interface ListOptions {
    autoSuggest?: boolean;
    redirect?: boolean;
    limit?: number;
}

export interface SearchOptions {
    limit?: number;
    suggestion?: boolean;
}

export interface GeoOptions {
    limit?: number;
    radius?: number;
}

export type EventTypes = 'all' | 'selected' | 'births' | 'deaths' | 'events' | 'holidays';

export interface EventOptions {
    type?: EventTypes;
    month?: string;
    day?: string;
}

export interface FeaturedContentOptions {
    year?: string;
    month?: string;
    day?: string;
}

export interface PdfOptions {
    autoSuggest?: boolean;
    format?: 'desktop' | 'mobile';
    type?: 'a4' | 'letter' | 'legal';
}

export interface AutocompletionOptions {
    limit?: number;
}


export interface InfoboxField {
    value: string | string[];
    [key: string]: any;
}

export interface Infobox {
    [key: string]: InfoboxField | string | string[];
}

export interface WikiMetadata {
    categories: string[];
    topics: string[];
    readingTime: number;
    popularity: number;
}

export const LANGUAGE_CONFIG = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
    { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
    { code: 'pl', name: 'Polish', flag: '🇵🇱' },
    { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
] as const;

export const LANGUAGE_MAP = new Map(LANGUAGE_CONFIG.map(l => [l.code, l]));
export const LANGUAGE_FLAGS = Object.fromEntries(
    LANGUAGE_CONFIG.map(l => [l.code, l.flag])
) as Record<SupportedLanguage, string>;

declare global {
    interface Window {
        recommendationsWorker?: Worker;
        articleFetcherWorker?: Worker;
    }
}
