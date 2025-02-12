export interface ShareOption {
    id: string;
    name: string;
    icon: string; // SVG path
    url: (title: string, url: string) => string;
}

const APP_PROMO = {
    name: "WakaWiki",
    description: "Discover more articles on WakaWiki - A modern Wikipedia reader with AI recommendations",
    url: "https://wakawiki.netlify.app",
    hashtags: ["WakaWiki", "Wikipedia", "AIRecommendations"],
    ref: "waka_share" 
} as const;

export const SHARE_OPTIONS: ShareOption[] = [
    {
        id: 'copy',
        name: 'Copy Link',
        icon: 'M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M12 1v10l3-3m-3 3l-3-3',
        url: (title, url) => {
            // Add promo text for everything except Wikipedia
            if (url.includes('wikipedia.org')) {
                return `${url}?ref=${APP_PROMO.ref}`;
            }
            return `${title}\n${url}\n\n${APP_PROMO.description}\n${APP_PROMO.url}`;
        }
    },
    {
        id: 'twitter',
        name: 'Twitter',
        icon: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z',
        url: (title, url) => {
            const wikiUrl = url.includes('wikipedia.org') ? `${url}?ref=${APP_PROMO.ref}` : url;
            const text = url.includes('wikipedia.org') 
                ? `${title}`
                : `${title}\n\n${APP_PROMO.description}`;
            return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(wikiUrl)}&hashtags=${APP_PROMO.hashtags.join(',')}`;
        }
    },
    {
        id: 'facebook',
        name: 'Facebook',
        icon: 'M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z',
        url: (title, url) => {
            const wikiUrl = url.includes('wikipedia.org') ? `${url}?ref=${APP_PROMO.ref}` : url;
            const quote = url.includes('wikipedia.org')
                ? title
                : `${title}\n\n${APP_PROMO.description} #${APP_PROMO.hashtags.join(' #')}`;
            return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(wikiUrl)}&quote=${encodeURIComponent(quote)}`;
        }
    },
    {
        id: 'whatsapp',
        name: 'WhatsApp',
        icon: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z',
        url: (title, url) => {
            const wikiUrl = url.includes('wikipedia.org') ? `${url}?ref=${APP_PROMO.ref}` : url;
            const text = url.includes('wikipedia.org')
                ? `${title}\n\n${wikiUrl}`
                : `${title}\n\n${wikiUrl}\n\n${APP_PROMO.description}\n${APP_PROMO.url}`;
            return `https://wa.me/?text=${encodeURIComponent(text)}`;
        }
    },
    {
        id: 'telegram',
        name: 'Telegram',
        icon: 'M22.05 2.478c-.14-.65-.574-1.18-1.176-1.442-.602-.26-1.29-.206-1.846.152L2.03 11.188c-.665.432-1.016 1.205-.87 1.99.145.786.693 1.42 1.415 1.64l3.62 1.11 8.282-7.49c.206-.187.528-.167.715.04.187.206.167.528-.04.715l-7.373 6.66v3.137c0 .735.403 1.41 1.053 1.76.65.348 1.437.316 2.053-.085l2.53-1.646 3.317 2.454c.275.204.602.31.935.31.185 0 .37-.034.547-.103.505-.186.89-.597 1.042-1.112l4.37-14.806c.175-.595.097-1.228-.168-1.782z',
        url: (title, url) => {
            const wikiUrl = url.includes('wikipedia.org') ? `${url}?ref=${APP_PROMO.ref}` : url;
            const text = url.includes('wikipedia.org')
                ? title
                : `${title}\n\n${APP_PROMO.description}`;
            return `https://t.me/share/url?url=${encodeURIComponent(wikiUrl)}&text=${encodeURIComponent(text)}`;
        }
    }
];

export function shareArticle(option: ShareOption, title: string, url: string): void {
    if (option.id === 'copy') {
        navigator.clipboard.writeText(option.url(title, url));
        return;
    }
    window.open(option.url(title, url), '_blank');
}

export function getShareText(title: string, url: string): string {
    // For non-Wikipedia URLs, include the full promo
    if (!url.includes('wikipedia.org')) {
        return `${title}\n\n${url}\n\n${APP_PROMO.description}\n${APP_PROMO.url}`;
    }
    // For Wikipedia URLs, just add the ref parameter
    return `${title}\n\n${url}?ref=${APP_PROMO.ref}`;
}
