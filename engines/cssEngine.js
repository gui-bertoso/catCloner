(function initializeCssEngine(global) {
    'use strict';

    function processLinks(snapshot, registerAsset) {
        snapshot.querySelectorAll('link[rel="stylesheet"], link[rel="preload"], link[rel="prefetch"], link[rel="manifest"], link[rel*="icon"]').forEach(link => {
            const as = link.getAttribute('as');
            const rel = link.rel;
            let type = 'misc';
            if (rel === 'stylesheet' || as === 'style') type = 'css';
            else if (as === 'script') type = 'js';
            else if (as === 'image' || rel.includes('icon')) type = 'image';
            else if (as === 'font') type = 'font';
            else if (as === 'video') type = 'video';
            if (type === 'js') return;
            const localPath = registerAsset(link.getAttribute('href'), type);
            if (localPath) link.setAttribute('href', localPath);
        });
    }

    function processInlineStyles(snapshot, registerAsset) {
        const urlPattern = /url\(['"]?([^'"]+?)['"]?\)/g;
        snapshot.querySelectorAll('[style], style').forEach(element => {
            const content = element.tagName === 'STYLE' ? element.textContent : element.getAttribute('style');
            if (!content) return;
            const rewritten = content.replace(urlPattern, (match, url) => {
                const type = /\.(woff2?|ttf|otf|eot)/i.test(url) ? 'font' : 'image';
                const localPath = registerAsset(url, type);
                return localPath ? `url("${localPath}")` : match;
            });
            if (element.tagName === 'STYLE') element.textContent = rewritten;
            else element.setAttribute('style', rewritten);
        });
    }

    global.CatClonerCssEngine = Object.freeze({ processLinks, processInlineStyles });
})(globalThis);
