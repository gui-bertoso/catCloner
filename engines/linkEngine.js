(function initializeLinkEngine(global) {
    'use strict';

    const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|dclid|mc_.+|ref_|referrer|source)$/i;
    const BLOCKED_ROUTES = /\/(?:login|logout|signin|signup|account|checkout|payment|oauth|auth)(?:\/|$)/i;
    const FILE_ROUTES = /\.(?:jpe?g|png|gif|webp|avif|svg|css|js|mjs|json|xml|pdf|zip|rar|7z|mp[34]|webm|woff2?|ttf|otf)(?:$|\?)/i;

    function normalize(value, baseUrl) {
        try {
            const url = new URL(value, baseUrl);
            if (!/^https?:$/.test(url.protocol)) return null;
            url.hash = '';
            Array.from(url.searchParams.keys()).forEach(key => {
                if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
            });
            url.pathname = url.pathname.replace(/\/{2,}/g, '/');
            return url.href;
        } catch (_) { return null; }
    }

    function score(url, anchorText) {
        let value = 0;
        if (/product|produto|item|detail|artigo|article|post/i.test(url.pathname)) value += 30;
        if (/-i\.\d+\.\d+/i.test(url.pathname)) value += 50;
        if (/comprar|buy|saiba mais|ver produto|details/i.test(anchorText || '')) value += 15;
        value += Math.min(15, url.pathname.split('/').filter(Boolean).length * 3);
        if (url.search) value -= 4;
        return value;
    }

    function discover(snapshot, pageUrl, limit = 500) {
        const current = new URL(pageUrl);
        const candidates = [];
        snapshot.querySelectorAll('a[href], area[href]').forEach(anchor => {
            candidates.push({ value: anchor.getAttribute('href'), text: anchor.textContent?.trim() || '' });
            const absolute = normalize(anchor.getAttribute('href'), pageUrl);
            if (absolute && new URL(absolute).origin === current.origin) anchor.setAttribute('href', absolute);
        });
        snapshot.querySelectorAll('[data-href], [data-url], [data-link], [data-route], [routerlink]').forEach(element => {
            ['data-href', 'data-url', 'data-link', 'data-route', 'routerlink'].forEach(attribute => {
                if (element.getAttribute(attribute)) candidates.push({ value: element.getAttribute(attribute), text: element.textContent?.trim() || '' });
            });
        });

        const unique = new Map();
        for (const candidate of candidates) {
            const href = normalize(candidate.value, pageUrl);
            if (!href || unique.has(href)) continue;
            const url = new URL(href);
            if (url.origin !== current.origin || href === normalize(pageUrl, pageUrl)) continue;
            if (BLOCKED_ROUTES.test(url.pathname) || FILE_ROUTES.test(url.pathname)) continue;
            if (current.hostname.includes('shopee') && !/-i\.\d+\.\d+/i.test(url.pathname)) continue;
            unique.set(href, score(url, candidate.text));
        }
        return Array.from(unique.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([href]) => href);
    }

    global.CatClonerLinkEngine = Object.freeze({ discover, normalize });
})(globalThis);
