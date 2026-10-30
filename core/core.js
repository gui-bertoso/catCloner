(function initializeCatClonerCore(global) {
    'use strict';

    function stableHash(value) {
        let hash = 2166136261;
        const text = String(value ?? '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36).padStart(7, '0');
    }

    function safeFilename(value, fallback = 'asset', maxLength = 64) {
        const cleaned = String(value || fallback)
            .replace(/[^a-z0-9._-]/gi, '_')
            .replace(/_+/g, '_')
            .substring(0, maxLength);
        return cleaned || fallback;
    }

    function normalizeUrl(value) {
        try {
            const url = new URL(value);
            url.hash = '';
            return url.href;
        } catch (_) {
            return value;
        }
    }

    global.CatClonerCore = Object.freeze({
        stableHash,
        safeFilename,
        normalizeUrl,
        version: '4.4.0'
    });
})(globalThis);
