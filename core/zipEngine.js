(function initializeZipEngine(global) {
    'use strict';

    async function ensureDocument() {
        const hasDocument = chrome.offscreen.hasDocument
            ? await chrome.offscreen.hasDocument()
            : false;
        if (!hasDocument) {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['BLOBS'],
                justification: 'Build and download the cloned website as a ZIP file.'
            });
        }
    }

    async function send(message) {
        const response = await chrome.runtime.sendMessage({ target: 'offscreenZip', ...message });
        if (!response?.success) throw new Error(response?.error || 'The ZIP worker did not respond.');
        return response;
    }

    async function blobToBase64(blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const chunkSize = 0x8000;
        let binary = '';
        for (let index = 0; index < bytes.length; index += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
        }
        return btoa(binary);
    }

    global.CatClonerZipEngine = Object.freeze({ ensureDocument, send, blobToBase64 });
})(globalThis);
