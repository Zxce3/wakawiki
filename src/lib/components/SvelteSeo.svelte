<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import type { WikiArticle } from '$lib/types';

    export let article: WikiArticle | null = null;
    export let siteName = "WakaWiki";
    export let baseUrl = browser ? window.location.origin : '';

    // Add default fallback metadata
    const DEFAULT_METADATA = {
        title: "WakaWiki - Discover Wikipedia Articles",
        description: "Explore curated Wikipedia articles in your preferred language. Discover new knowledge through an engaging reading experience.",
        image: '/screenshot-desktop.png'
    };

    // Fallback images for when article has no image
    const DEFAULT_IMAGES = [
        '/screenshot-mobile.png',
        '/screenshot-desktop.png',
    ];

    let title: string;
    let description: string;
    let imageUrl: string;
    let canonicalUrl: string;
    let jsonLd: any;

    $: {
        // Use fallback values if article is null or loading
        title = article ? generateTitle(article) : DEFAULT_METADATA.title;
        description = article ? generateDescription(article) : DEFAULT_METADATA.description;
        imageUrl = article?.imageUrl || getRandomDefaultImage();
        canonicalUrl = `${baseUrl}/`;
    }

    function generateTitle(article: WikiArticle): string {
        return `${article.title} | ${siteName}`;
    }

    function generateDescription(article: WikiArticle): string {
        // Clean up and truncate excerpt
        const cleanExcerpt = article.excerpt?.replace(/\[\d+\]/g, '').trim() || '';
        return cleanExcerpt.length > 160 
            ? cleanExcerpt.substring(0, 157) + '...'
            : cleanExcerpt;
    }

    function getRandomDefaultImage(): string {
        return DEFAULT_IMAGES[Math.floor(Math.random() * DEFAULT_IMAGES.length)];
    }

    // Helper function to get keywords from article
    function getKeywords(article: WikiArticle | null): string {
        if (!article) return DEFAULT_METADATA.title;
        
        const keywords = [
            article.title,
            ...(article.categories || []),
            ...(article.tags || [])
        ];
        
        // Clean and deduplicate keywords
        return [...new Set(keywords)]
            .filter(Boolean)
            .map(k => k.trim())
            .join(', ');
    }

    // Add organization details
    const ORGANIZATION = {
        name: siteName,
        url: baseUrl,
        logo: `${baseUrl}/logo.png`,
        sameAs: [
            'https://github.com/zxce3/wakawiki',
            // Add other social media URLs here
        ]
    };

    // Move jsonLd initialization outside the reactive block
    function generateJsonLd(article: WikiArticle | null) {
        if (!article) {
            return {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: DEFAULT_METADATA.title,
                description: DEFAULT_METADATA.description,
                url: baseUrl,
                image: DEFAULT_METADATA.image,
                publisher: {
                    '@type': 'Organization',
                    ...ORGANIZATION
                }
            };
        }

        const dateModified = article.lastModified || new Date().toISOString();
        const datePublished = article.datePublished || dateModified;

        return {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: article.title,
            name: article.title,
            description: generateDescription(article),
            
            // Dates
            datePublished,
            dateModified,
            dateCreated: article.dateCreated || datePublished,

            // Content details
            articleBody: article.excerpt,
            wordCount: article.excerpt?.split(/\s+/).length || 0,
            
            // Media
            image: {
                '@type': 'ImageObject',
                url: article.imageUrl || getRandomDefaultImage(),
                width: article.imageWidth || 1200,
                height: article.imageHeight || 630,
                caption: article.imageCaption || article.title
            },

            // Publisher info
            publisher: {
                '@type': 'Organization',
                ...ORGANIZATION,
                logo: {
                    '@type': 'ImageObject',
                    url: ORGANIZATION.logo,
                    width: 112,
                    height: 112
                }
            },

            // Author info - use Wikipedia as author
            author: {
                '@type': 'Organization',
                name: 'Wikipedia',
                url: 'https://www.wikipedia.org'
            },

            // Source and attribution
            isPartOf: {
                '@type': 'WebSite',
                name: 'Wikipedia',
                url: 'https://www.wikipedia.org'
            },
            
            // Content metadata
            inLanguage: article.language || 'en',
            keywords: getKeywords(article),
            articleSection: article.categories?.[0] || 'General',
            license: 'https://creativecommons.org/licenses/by-sa/4.0/',

            // References and citations
            citation: article.citations?.map((citation: { title: any; url: any; }) => ({
                '@type': 'CreativeWork',
                name: citation.title || 'Citation',
                url: citation.url
            })) || [],

            // Structured references
            isBasedOn: {
                '@type': 'WebPage',
                '@id': article.url,
                name: 'Wikipedia Article',
                url: article.url
            },

            // Additional metadata
            about: {
                '@type': 'Thing',
                name: article.title,
                description: generateDescription(article),
                sameAs: article.url,
                mainEntityOfPage: {
                    '@type': 'WebPage',
                    '@id': canonicalUrl
                }
            },

            // Topic tags
            mentions: [
                ...(article.categories || []).map(category => ({
                    '@type': 'Thing',
                    name: category
                })),
                ...(article.tags || []).map((tag: any) => ({
                    '@type': 'Thing',
                    name: tag
                }))
            ]
        };
    }

    // Use reactive statement to update jsonLd
    $: jsonLd = generateJsonLd(article);

    // Create a safe JSON string for the script tag
    $: jsonLdString = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
</script>

<svelte:head>
    <!-- Basic Meta Tags -->
    <title>{title}</title>
    <meta name="description" content={description}>
    <link rel="canonical" href={canonicalUrl}>
    <meta name="language" content={article?.language || 'en'}>

    <!-- Article Timing -->
    {#if article?.lastModified}
        <meta property="article:modified_time" content={article.lastModified}>
    {/if}
    {#if article?.datePublished}
        <meta property="article:published_time" content={article.datePublished}>
    {/if}

    <!-- Enhanced Social Media Tags -->
    <meta property="og:locale" content={article?.language || 'en'}>
    {#if article?.imageUrl}
        <meta property="og:image:width" content={article.imageWidth || '1200'}>
        <meta property="og:image:height" content={article.imageHeight || '630'}>
        <meta property="og:image:alt" content={article.imageCaption || article.title}>
    {/if}

    <!-- Additional Twitter Tags -->
    <meta name="twitter:site" content="@wakawiki">
    <meta name="twitter:creator" content="@wakawiki">
    {#if article?.imageUrl}
        <meta name="twitter:image:alt" content={article.imageCaption || article.title}>
    {/if}

    {#if browser}
        {@html `<script type="application/ld+json">${jsonLdString}</script>`}
    {/if}

    {#if article?.references?.length}
        <meta name="citation_references" content={article.references.map((ref: { url: any; }) => ref.url).join(',')} />
    {/if}

    {#if article?.citations?.length}
        <meta name="citation_source" content={article.citations.map((cite: { url: any; }) => cite.url).join(',')} />
    {/if}

    {#if article?.url}
        <meta name="source" content={article.url} />
    {/if}
    <link rel="license" href="https://creativecommons.org/licenses/by-sa/4.0/" />

    {#if article?.categories?.length}
        <meta name="article:section" content={article.categories[0]}>
        {#each article.categories as category}
            <meta property="article:tag" content={category}>
        {/each}
    {/if}

    {#if article?.tags?.length}
        {#each article.tags as tag}
            <meta property="article:tag" content={tag}>
        {/each}
    {/if}

    <meta name="keywords" content={getKeywords(article)}>

    <!-- Add robots meta if needed -->
    {#if article?.noIndex}
        <meta name="robots" content="noindex,nofollow">
    {:else}
        <meta name="robots" content="index,follow">
    {/if}

    <!-- Mobile App Meta Tags -->
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black">
    <meta name="apple-mobile-web-app-title" content={siteName}>
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="theme-color" content="#000000">
    <meta name="msapplication-TileColor" content="#000000">
    <meta name="msapplication-navbutton-color" content="#000000">

</svelte:head>
