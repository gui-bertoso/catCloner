(function initializeJsEngine(global) {
    'use strict';

    function neutralize(snapshot) {
        snapshot.querySelectorAll('script, iframe, noscript').forEach(element => element.remove());
        snapshot.querySelectorAll('*').forEach(element => {
            for (const attribute of Array.from(element.attributes)) {
                if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
            }
            element.removeAttribute('integrity');
            element.removeAttribute('nonce');
            element.removeAttribute('crossorigin');
        });
        return snapshot;
    }

    global.CatClonerJsEngine = Object.freeze({ neutralize });
})(globalThis);
