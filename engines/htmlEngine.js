(function initializeHtmlEngine(global) {
    'use strict';

    function createSnapshot(sourceDocument) {
        const snapshot = new DOMParser().parseFromString(
            `<!doctype html>${sourceDocument.documentElement.outerHTML}`,
            'text/html'
        );
        snapshot.getElementById('catcloner-working-overlay')?.remove();
        snapshot.querySelectorAll('meta[http-equiv]').forEach(meta => {
            if ((meta.getAttribute('http-equiv') || '').toLowerCase() === 'content-security-policy') meta.remove();
        });

        // outerHTML does not preserve the concrete candidate selected from a
        // responsive srcset. Carry the browser's rendered choice into the copy.
        const liveImages = Array.from(sourceDocument.images || []);
        const snapshotImages = Array.from(snapshot.images || []);
        liveImages.forEach((image, index) => {
            const renderedSource = image.currentSrc || image.src;
            if (renderedSource && !renderedSource.startsWith('data:') && snapshotImages[index]) {
                snapshotImages[index].setAttribute('data-catcloner-current-src', renderedSource);
            }
        });
        return snapshot;
    }

    function sanitizeForms(snapshot) {
        snapshot.querySelectorAll('input').forEach(input => {
            const type = (input.getAttribute('type') || 'text').toLowerCase();
            input.removeAttribute('checked');
            input.removeAttribute('name');
            input.removeAttribute('autocomplete');
            if (type === 'hidden') input.remove();
            else if (!['button', 'submit', 'reset'].includes(type)) {
                input.removeAttribute('value');
                input.setAttribute('placeholder', '');
            }
        });
        snapshot.querySelectorAll('textarea').forEach(element => {
            element.textContent = '';
            element.removeAttribute('name');
            element.removeAttribute('autocomplete');
            element.setAttribute('placeholder', '');
        });
        snapshot.querySelectorAll('select').forEach(element => {
            element.removeAttribute('name');
            element.querySelectorAll('option').forEach(option => option.removeAttribute('selected'));
        });
        snapshot.querySelectorAll('[contenteditable]').forEach(element => {
            element.textContent = '';
            element.removeAttribute('contenteditable');
        });
        snapshot.querySelectorAll('form').forEach(form => {
            form.removeAttribute('action');
            form.removeAttribute('method');
            form.setAttribute('onsubmit', 'return false');
        });
        return snapshot;
    }

    global.CatClonerHtmlEngine = Object.freeze({ createSnapshot, sanitizeForms });
})(globalThis);
