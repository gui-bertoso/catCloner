(function initializePrivacyEngine(global) {
    'use strict';

    const patterns = [
        { regex: /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, replacement: 'user@example.com' },
        { regex: /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g, replacement: '(00) 00000-0000' },
        { regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, replacement: '000.000.000-00' },
        { regex: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, replacement: '00.000.000/0000-00' },
        { regex: /\bCEP\s*:?[\s-]*\d{5}-?\d{3}\b/gi, replacement: 'CEP 00000-000' },
        { regex: /\b(?:\d[ -]*?){13,19}\b/g, replacement: '•••• •••• •••• 0000' }
    ];

    function redactRenderedText(snapshot) {
        const walker = snapshot.createTreeWalker(snapshot.body || snapshot.documentElement, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(node => {
            if (node.parentElement?.closest('script,style,code,pre')) return;
            let value = node.nodeValue || '';
            patterns.forEach(pattern => { value = value.replace(pattern.regex, pattern.replacement); });
            node.nodeValue = value;
        });

        snapshot.querySelectorAll('[class*="address" i], [data-testid*="address" i], [aria-label*="endereço" i], [aria-label*="address" i]').forEach(element => {
            if ((element.textContent || '').trim().length > 8 && element.children.length < 4) element.textContent = 'Fictional demonstration address';
        });
        snapshot.querySelectorAll('[class*="user-name" i], [data-testid*="user-name" i], [aria-label*="usuário" i], [aria-label*="user" i]').forEach(element => {
            if ((element.textContent || '').trim().length < 80) element.textContent = 'Demo user';
        });
        return snapshot;
    }

    function sanitizeUrl(value) {
        try {
            const url = new URL(value);
            const sensitive = /(?:token|session|session_id|cho_session|pref-id|offering_data|callback_url|authorization|auth|email|document|cpf|address|tracking|click_id)/i;
            Array.from(url.searchParams.keys()).forEach(key => {
                if (sensitive.test(key) || /^(?:utm_.+|gclid|fbclid|gbraid|gad_.+|matt_.+|cq_.+)$/i.test(key)) url.searchParams.delete(key);
            });
            url.hash = '';
            return url.href;
        } catch (_) { return '[URL removed]'; }
    }

    global.CatClonerPrivacyEngine = Object.freeze({ redactRenderedText, sanitizeUrl });
})(globalThis);
