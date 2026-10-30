importScripts('core/core.js', 'core/zipEngine.js', 'engines/privacyEngine.js', 'core/flowEngine.js');

console.log(`catCloner ${CatClonerCore.version} modular engine initialized.`);

const ensureZipDocument = CatClonerZipEngine.ensureDocument;
const sendZipMessage = CatClonerZipEngine.send;
const blobToBase64 = CatClonerZipEngine.blobToBase64;
const cancelledCloneTabs = new Set();
const cloneAbortControllers = new Map();

const CAPTURE_ENGINE_FILES = [
    'engines/htmlEngine.js',
    'engines/cssEngine.js',
    'engines/imgEngine.js',
    'engines/videoEngine.js',
    'engines/jsEngine.js',
    'engines/linkEngine.js',
    'engines/privacyEngine.js'
];

async function loadCaptureEngines(targetTabId) {
    await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        files: CAPTURE_ENGINE_FILES
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startClone") {
        cancelledCloneTabs.delete(request.tabId);
        sendResponse({ success: true, started: true });
        runCloner(request.tabId, request.options)
        .catch(err => {
            if (err?.message === 'CLONE_CANCELLED') {
                chrome.runtime.sendMessage({ action: 'cloneCancelled' }).catch(() => {});
                return;
            }
            console.error("Cloning failed:", err);
            chrome.runtime.sendMessage({
                action: "cloneFailed",
                error: err instanceof Error ? err.message : String(err)
            }).catch(() => {});
        });
        return false;
    }
    if (request.action === 'cancelClone') {
        const targetTabId = request.tabId ?? sender.tab?.id;
        cancelledCloneTabs.add(targetTabId);
        cloneAbortControllers.get(targetTabId)?.forEach(controller => controller.abort());
        sendResponse({ success: true, cancelled: true });
        return false;
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!String(request.action || '').startsWith('flow')) return;
    (async () => {
        if (request.action === 'flowStart') {
            CatClonerFlowEngine.setCancelled(false);
            if (flowAutoCapturePromise) await flowAutoCapturePromise;
            await CatClonerFlowEngine.clear();
            await setFlowRecorderState({ active: true, tabId: request.tabId, lastFingerprint: null, startedAt: Date.now() });
            await installFlowAutoObserver(request.tabId);
            return { success: true, steps: [], recording: true };
        }
        if (request.action === 'flowStatus') {
            const steps = await CatClonerFlowEngine.list();
            const recorder = await getFlowRecorderState();
            return { success: true, recording: Boolean(recorder.active), steps: steps.map(({ id, order, title, url, createdAt }) => ({ id, order, title, url, createdAt })) };
        }
        if (request.action === 'flowCapture') {
            CatClonerFlowEngine.setCancelled(false);
            const step = await CatClonerFlowEngine.capture(request.tabId, CAPTURE_ENGINE_FILES);
            return { success: true, step: { id: step.id, order: step.order, title: step.title, url: step.url, createdAt: step.createdAt } };
        }
        if (request.action === 'flowAutoCandidate') {
            captureAutomaticFlowStep(sender.tab?.id, request.fingerprint).catch(() => {});
            return { success: true, queued: true };
        }
        if (request.action === 'flowDelete') {
            await CatClonerFlowEngine.remove(request.stepId);
            return { success: true };
        }
        if (request.action === 'flowReset') {
            await setFlowRecorderState({ active: false });
            CatClonerFlowEngine.setCancelled(true);
            if (flowAutoCapturePromise) await flowAutoCapturePromise.catch(() => {});
            await CatClonerFlowEngine.clear();
            return { success: true, steps: [], recording: false };
        }
        if (request.action === 'flowFinish') {
            await setFlowRecorderState({ active: false });
            if (flowAutoCapturePromise) await flowAutoCapturePromise;
            CatClonerFlowEngine.setCancelled(false);
            const result = await CatClonerFlowEngine.finish();
            return { success: true, ...result, recording: false };
        }
        throw new Error('Unknown flow action.');
    })().then(sendResponse).catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
});

let flowAutoCapturePromise = null;

async function getFlowRecorderState() {
    const result = await chrome.storage.local.get('catClonerFlowRecorder');
    return result.catClonerFlowRecorder || { active: false };
}

async function setFlowRecorderState(patch) {
    const current = await getFlowRecorderState();
    const next = { ...current, ...patch };
    await chrome.storage.local.set({ catClonerFlowRecorder: next });
    return next;
}

async function installFlowAutoObserver(tabId) {
    if (!tabId) return;
    await chrome.scripting.executeScript({ target: { tabId }, func: () => {
        window.__catClonerFlowObserver?.disconnect();
        clearTimeout(window.__catClonerFlowTimer);
        let lastSent = '';
        const hash = value => {
            let number = 2166136261;
            for (let index = 0; index < value.length; index++) { number ^= value.charCodeAt(index); number = Math.imul(number, 16777619); }
            return (number >>> 0).toString(36);
        };
        const emitWhenStable = () => {
            clearTimeout(window.__catClonerFlowTimer);
            window.__catClonerFlowTimer = setTimeout(() => {
                const heading = document.querySelector('h1,h2,[role="heading"]')?.textContent?.trim() || '';
                const visibleText = document.body?.innerText?.replace(/\s+/g, ' ').trim().substring(0, 1200) || '';
                const fingerprint = hash(`${location.href.split('#')[0]}|${document.title}|${heading}|${visibleText}|${document.images?.length || 0}`);
                if (fingerprint === lastSent || visibleText.length < 40) return;
                lastSent = fingerprint;
                chrome.runtime.sendMessage({ action: 'flowAutoCandidate', fingerprint }).catch(() => {});
            }, 2200);
        };
        window.__catClonerFlowObserver = new MutationObserver(emitWhenStable);
        window.__catClonerFlowObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        emitWhenStable();
    }}).catch(() => {});
}

async function captureAutomaticFlowStep(tabId, fingerprint) {
    const recorder = await getFlowRecorderState();
    if (!recorder.active || recorder.tabId !== tabId || recorder.lastFingerprint === fingerprint) return;
    if (flowAutoCapturePromise) return flowAutoCapturePromise;
    flowAutoCapturePromise = (async () => {
        await setFlowRecorderState({ lastFingerprint: fingerprint });
        const step = await CatClonerFlowEngine.capture(tabId, CAPTURE_ENGINE_FILES);
        chrome.runtime.sendMessage({ action: 'flowStepCaptured', step: { id: step.id, order: step.order, title: step.title, url: step.url } }).catch(() => {});
    })().catch(async error => {
        await setFlowRecorderState({ lastFingerprint: null });
        console.warn('Automatic flow capture failed:', error);
    }).finally(() => { flowAutoCapturePromise = null; });
    return flowAutoCapturePromise;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') return;
    const recorder = await getFlowRecorderState().catch(() => ({ active: false }));
    if (recorder.active && recorder.tabId === tabId) await installFlowAutoObserver(tabId);
});

chrome.tabs.onRemoved.addListener(async tabId => {
    const recorder = await getFlowRecorderState().catch(() => ({ active: false }));
    if (recorder.active && recorder.tabId === tabId) await setFlowRecorderState({ active: false });
});

async function runCloner(tabId, requestedOptions = {}) {
    await showCloneOverlayV4(tabId);
    try {
        return await runClonerCore(tabId, requestedOptions);
    } finally {
        await hideCloneOverlay(tabId);
    }
}

async function showCloneOverlay(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const overlayId = "catcloner-working-overlay";
            if (document.getElementById(overlayId)) return;

            const host = document.createElement("div");
            host.id = overlayId;
            host.style.cssText = [
                "all:initial",
                "position:fixed",
                "inset:0",
                "z-index:2147483647",
                "display:grid",
                "place-items:center",
                "pointer-events:auto"
            ].join("!important;") + "!important;";
            const shadow = host.attachShadow({ mode: "open" });
            shadow.innerHTML = `
                <style>
                    :host {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    }
                    .backdrop {
                        position: absolute;
                        inset: 0;
                        background: #101014;
                    }
                    .card {
                        position: relative;
                        width: min(330px, calc(100vw - 40px));
                        padding: 28px 24px 24px;
                        border: 1px solid rgba(255,255,255,.14);
                        border-radius: 22px;
                        background: #19191f;
                        color: #fffffe;
                        box-shadow: 0 24px 80px rgba(0,0,0,.45);
                        text-align: center;
                    }
                    .workshop {
                        position: relative;
                        width: 150px;
                        height: 105px;
                        margin: 0 auto 12px;
                    }
                    .cat {
                        position: absolute;
                        left: 22px;
                        bottom: 13px;
                        font-size: 64px;
                        line-height: 1;
                        filter: drop-shadow(0 7px 8px rgba(0,0,0,.3));
                        animation: cat-bounce .52s ease-in-out infinite alternate;
                    }
                    .hammer {
                        position: absolute;
                        right: 19px;
                        top: 4px;
                        font-size: 52px;
                        line-height: 1;
                        transform-origin: 18% 82%;
                        animation: hammer-hit .52s cubic-bezier(.7,0,.3,1) infinite;
                    }
                    .bench {
                        position: absolute;
                        left: 18px;
                        right: 18px;
                        bottom: 4px;
                        height: 13px;
                        border-radius: 8px;
                        background: linear-gradient(90deg, #ff8e53, #ff6b6b);
                        box-shadow: 0 5px 0 #9d3d36;
                    }
                    .spark {
                        position: absolute;
                        right: 38px;
                        bottom: 19px;
                        color: #ffd166;
                        font-size: 25px;
                        animation: spark .52s ease-out infinite;
                    }
                    h2 { margin: 0; font-size: 20px; letter-spacing: -.3px; }
                    p { margin: 7px 0 0; color: #a7a9be; font-size: 13px; }
                    .dots::after { content: ""; animation: dots 1.2s steps(4,end) infinite; }
                    @keyframes hammer-hit {
                        0%, 22% { transform: rotate(-38deg); }
                        64%, 100% { transform: rotate(18deg); }
                    }
                    @keyframes cat-bounce { to { transform: translateY(-3px); } }
                    @keyframes spark {
                        0%, 55% { opacity: 0; transform: scale(.3); }
                        65% { opacity: 1; transform: scale(1.2); }
                        100% { opacity: 0; transform: translate(8px,-8px) scale(.6); }
                    }
                    @keyframes dots {
                        0% { content: ""; } 25% { content: "."; }
                        50% { content: ".."; } 75%,100% { content: "..."; }
                    }
                    @media (prefers-reduced-motion: reduce) {
                        .cat, .hammer, .spark, .dots::after { animation: none; }
                    }
                </style>
                <div class="backdrop"></div>
                <section class="card" role="status" aria-live="polite">
                    <div class="workshop" aria-hidden="true">
                        <div class="cat">🐱</div>
                        <div class="hammer">🔨</div>
                        <div class="spark">✦</div>
                        <div class="bench"></div>
                    </div>
                    <h2>catCloner working here<span class="dots"></span></h2>
                    <p>Building your offline copy. Keep this tab open.</p>
                </section>
            `;
            const attachOverlay = () => {
                if (!host.isConnected) {
                    (document.body || document.documentElement).appendChild(host);
                }
            };
            attachOverlay();

            window.__catClonerOverlayObserver?.disconnect();
            window.__catClonerOverlayObserver = new MutationObserver(attachOverlay);
            window.__catClonerOverlayObserver.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        }
    });
}

async function hideCloneOverlay(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            window.__catClonerOverlayObserver?.disconnect();
            delete window.__catClonerOverlayObserver;
            document.getElementById("catcloner-working-overlay")?.remove();
        }
    }).catch(() => {});
}

async function showCloneOverlayV4(tabId) {
    await hideCloneOverlay(tabId);
    await chrome.scripting.executeScript({ target: { tabId }, func: () => {
        const host = document.createElement('div');
        host.id = 'catcloner-working-overlay';
        host.style.cssText = 'all:initial!important;position:fixed!important;right:18px!important;bottom:18px!important;z-index:2147483647!important;pointer-events:none!important';
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>
        :host{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}.card{width:min(340px,calc(100vw - 36px));padding:14px;border:1px solid rgba(255,130,98,.28);border-radius:16px;background:rgba(9,11,16,.94);color:#f7f8fb;box-shadow:0 18px 55px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(18px);animation:enter .25s ease-out}.head,.brand,.stage,.controls{display:flex;align-items:center}.head{justify-content:space-between;gap:12px}.controls{gap:8px}.brand{gap:8px;font-size:12px;font-weight:800}.cat{font-size:19px;animation:bob .8s ease-in-out infinite alternate}.badge{padding:3px 6px;border:1px solid rgba(255,115,92,.25);border-radius:99px;color:#ff927f;font-size:7px;text-transform:uppercase}.percent{color:#ff927f;font:800 11px ui-monospace,monospace}.cancel{pointer-events:auto;padding:4px 7px;border:1px solid rgba(255,115,92,.3);border-radius:7px;background:transparent;color:#ff927f;font:700 8px system-ui;cursor:pointer}.stage{justify-content:space-between;margin:11px 0 7px}.stage strong{max-width:260px;overflow:hidden;color:#dce0e8;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.live{width:6px;height:6px;border-radius:50%;background:#5bd6a2;box-shadow:0 0 8px #5bd6a2;animation:pulse 1s infinite}.track{height:4px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.08)}.bar{width:2%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff735c,#ffb45f);transition:width .25s}.terminal{height:92px;margin-top:10px;overflow:hidden;padding:8px 9px;border:1px solid rgba(255,255,255,.065);border-radius:10px;background:#06080c;font:9px/1.55 ui-monospace,Consolas,monospace}.line{overflow:hidden;color:#788293;text-overflow:ellipsis;white-space:nowrap;animation:linein .2s ease-out}.tag{color:#ff8c77}.ok{color:#5bd6a2}.cursor{display:inline-block;width:5px;height:10px;margin-left:3px;background:#ff8c77;vertical-align:-2px;animation:blink .8s steps(1) infinite}@keyframes enter{from{opacity:0;transform:translateY(8px) scale(.98)}}@keyframes linein{from{opacity:0;transform:translateY(4px)}}@keyframes bob{to{transform:translateY(-2px)}}@keyframes pulse{50%{opacity:.35}}@keyframes blink{50%{opacity:0}}@media(prefers-reduced-motion:reduce){.card,.cat,.live,.cursor,.line{animation:none}}
        </style><section class="card" role="status" aria-live="polite"><div class="head"><div class="brand"><span class="cat">🐱</span><span>catCloner</span><span class="badge">4.0</span></div><div class="controls"><span class="percent">2%</span><button class="cancel" type="button">Cancel</button></div></div><div class="stage"><strong>Initializing modular engines</strong><span class="live"></span></div><div class="track"><div class="bar"></div></div><div class="terminal"><div class="lines"><div class="line"><span class="tag">[CORE]</span> session started <span class="ok">OK</span></div><div class="line"><span class="tag">[SAFE]</span> data protection active <span class="ok">OK</span></div><div class="line current"><span class="tag">[SCAN]</span> analyzing page<span class="cursor"></span></div></div></div></section>`;
        (document.body || document.documentElement).appendChild(host);
        shadow.querySelector('.cancel').addEventListener('click', () => {
            shadow.querySelector('.cancel').textContent = 'Canceling…';
            chrome.runtime.sendMessage({ action: 'cancelClone' }).catch(() => {});
        });
    }});
}

async function updateCloneOverlay(tabId, text, progress) {
    await chrome.scripting.executeScript({ target: { tabId }, args: [text, progress], func: (message, value) => {
        const shadow = document.getElementById('catcloner-working-overlay')?.shadowRoot;
        if (!shadow) return;
        const safeProgress = Math.max(0, Math.min(100, Number(value) || 0));
        shadow.querySelector('.stage strong').textContent = message || 'Processing page';
        shadow.querySelector('.percent').textContent = `${Math.round(safeProgress)}%`;
        shadow.querySelector('.bar').style.width = `${Math.max(2, safeProgress)}%`;
        const firstWord = String(message || '').split(/[\s:]/)[0].toLowerCase();
        const tags = { baixando:'ASSET', explorando:'LINK', consolidando:'CORE', compactando:'ZIP', captcha:'PAUSED', iniciando:'SCAN' };
        const tag = tags[firstWord] || 'ENGINE';
        const lines = shadow.querySelector('.lines');
        lines.querySelector('.current')?.remove();
        const completed = document.createElement('div');
        completed.className = 'line';
        const label = String(message || '').replace(/https?:\/\/\S+/g, '[url]').substring(0, 68);
        completed.textContent = `[${tag}] ${label} OK`;
        lines.appendChild(completed);
        const current = document.createElement('div'); current.className = 'line current';
        current.innerHTML = '<span class="tag">[NEXT]</span> processing<span class="cursor"></span>';
        lines.appendChild(current);
        while (lines.children.length > 6) lines.firstElementChild.remove();
    }}).catch(() => {});
}

async function runClonerCore(tabId, requestedOptions = {}) {
    const requestedPageLimit = Number.parseInt(requestedOptions?.pageLimit, 10);
    const requestedMaxDepth = Number.parseInt(requestedOptions?.maxDepth, 10);
    const pageLimit = Math.min(100, Math.max(1, Number.isFinite(requestedPageLimit) ? requestedPageLimit : 6));
    const maxDepth = Math.min(5, Math.max(0, Number.isFinite(requestedMaxDepth) ? requestedMaxDepth : 1));
    const assertNotCancelled = () => {
        if (cancelledCloneTabs.has(tabId)) throw new Error('CLONE_CANCELLED');
    };
    function notifyPopup(text, progress) {
        chrome.runtime.sendMessage({ action: "updateStatus", text, progress }).catch(() => {});
        updateCloneOverlay(tabId, text, progress).catch(() => {});
    }

    function isCaptchaUrl(value) {
        return /\/verify\/(?:captcha|traffic)(?:\/|\?|$)/i.test(value || '');
    }

    async function waitForCaptchaResolution(targetTabId) {
        let tab = await chrome.tabs.get(targetTabId);
        if (!isCaptchaUrl(tab.url)) return false;

        await hideCloneOverlay(targetTabId).catch(() => {});
        notifyPopup("CAPTCHA detected. Complete it in the Shopee tab to continue...", 4);
        await chrome.tabs.update(targetTabId, { active: true }).catch(() => {});

        // Keep the cloning operation alive while the user completes Shopee's
        // verification. This does not automate or bypass the CAPTCHA.
        while (true) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            tab = await chrome.tabs.get(targetTabId);
            if (!isCaptchaUrl(tab.url)) break;
        }

        notifyPopup("CAPTCHA completed. Waiting for the page to load...", 5);
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            tab = await chrome.tabs.get(targetTabId);
            if (tab.status === 'complete' && !isCaptchaUrl(tab.url)) break;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
        return true;
    }

    assertNotCancelled();
    notifyPopup("Starting dynamic asset discovery...", 2);

    const extractionFunc = async () => {
        const assetMap = new Map(); // originalUrl -> { filename, type }

        function stableHash(value) {
            let hash = 2166136261;
            for (let i = 0; i < value.length; i++) {
                hash ^= value.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }
            return (hash >>> 0).toString(36).padStart(7, '0');
        }

        // Trigger lazy loading progressively. Large catalog pages often render
        // cards only after each viewport has been visited.
        const originalScrollY = window.scrollY;
        let previousHeight = 0;
        for (let step = 0; step < 20; step++) {
            const currentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
            const nextY = Math.min((step + 1) * Math.max(window.innerHeight * 0.85, 600), currentHeight);
            window.scrollTo(0, nextY);
            await new Promise(r => setTimeout(r, 180));
            if (nextY >= currentHeight && currentHeight === previousHeight) break;
            previousHeight = currentHeight;
        }
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 800));

        const originalOrigin = window.location.origin;
        const originalPathname = window.location.pathname;
        const originalSearch = window.location.search;
        const originalHref = window.location.href;
        const originalHash = window.location.hash;
        const originalHost = window.location.host;
        const originalHostname = window.location.hostname;
        const originalPort = window.location.port;
        const originalProtocol = window.location.protocol;
        const snapshotDocument = CatClonerHtmlEngine.createSnapshot(document);
        window.scrollTo(0, originalScrollY);
        CatClonerHtmlEngine.sanitizeForms(snapshotDocument);

        function registerAsset(url, type) {
            if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#')) return null;
            try {
                const absoluteUrl = new URL(url, document.baseURI).href;
                if (assetMap.has(absoluteUrl)) return assetMap.get(absoluteUrl).localPath;

                const urlPath = new URL(absoluteUrl).pathname;
                const foundExt = urlPath.includes('.') ? urlPath.split('.').pop().toLowerCase().split(/[?#]/)[0] : null;

                let ext = 'bin';
                const isType = (t) => type === t || (typeof type === 'string' && type.includes(t));

                if (isType('image') || isType('img')) ext = foundExt || 'png';
                else if (isType('css')) ext = 'css';
                else if (isType('js') || isType('script')) ext = 'js';
                else if (isType('font')) ext = foundExt || 'woff2';
                else if (isType('video')) ext = foundExt || 'mp4';
                else if (foundExt) ext = foundExt;
                
                const hash = stableHash(absoluteUrl);
                const baseName = absoluteUrl.substring(absoluteUrl.lastIndexOf('/') + 1).split('?')[0].split('#')[0] || 'asset';
                const safeBaseName = baseName.replace(/[^a-z0-9._-]/gi, '_').substring(0, 32);
                const expectedSuffix = `.${ext}`;
                const filename = `${hash}_${safeBaseName}${safeBaseName.toLowerCase().endsWith(expectedSuffix) ? '' : expectedSuffix}`;

                const subfolder = type === 'image' ? 'images' : (type === 'css' ? 'css' : (type === 'js' ? 'js' : (type === 'font' ? 'fonts' : (type === 'video' ? 'videos' : 'misc'))));
                const localPath = `assets/${subfolder}/${filename}`;

                assetMap.set(absoluteUrl, { filename, subfolder, localPath, type });
                return localPath;
            } catch (e) {
                return null;
            }
        }

        CatClonerCssEngine.processLinks(snapshotDocument, registerAsset);
        CatClonerImgEngine.process(snapshotDocument, registerAsset);
        CatClonerCssEngine.processInlineStyles(snapshotDocument, registerAsset);
        CatClonerVideoEngine.process(snapshotDocument, registerAsset);

        // 6. Discovery via Performance API for visual resources only.
        if (window.performance && window.performance.getEntriesByType) {
            window.performance.getEntriesByType('resource').forEach(entry => {
                const visualTypes = ['img', 'css', 'link', 'font', 'video', 'audio'];
                if (visualTypes.includes(entry.initiatorType)) {
                    const type = entry.initiatorType === 'img' ? 'image' : entry.initiatorType;
                    registerAsset(entry.name, type);
                }
            });
        }

        // 7. Discovery via Intercepted calls
        // API calls are intentionally not archived in static snapshot mode.

        // 8. Discovery via Script Content Analysis (Regex)
        snapshotDocument.querySelectorAll('script').forEach(script => {
            const content = script.textContent;
            if (!content || content.length > 100000) return; // Skip very large scripts for performance
            const urlMatch = /"(https?:\/\/[^"]+?\.(?:js|css|png|jpg|jpeg|svg|webp|json|woff2?)(?:\?[^"]*)?)"/g;
            let m;
            while ((m = urlMatch.exec(content)) !== null) {
                // Original application scripts are not executed in the offline snapshot.
            }
        });

        const discoveredLinks = CatClonerLinkEngine.discover(snapshotDocument, window.location.href, 500);

        // Injetar script de correção ultra-robusto para chamadas dinâmicas e segurança
        const assetLookup = {};
        assetMap.forEach((data, url) => {
            assetLookup[url] = data.localPath;
        });

        // The rendered DOM is the source of truth for an offline snapshot.
        // Re-running the original app would call remote APIs and overwrite it.
        CatClonerJsEngine.neutralize(snapshotDocument);

        const fixScript = snapshotDocument.createElement('script');
        fixScript.textContent = `
            (function() {
                const origin = "${originalOrigin}";
                const originalPath = "${originalPathname}";
                const originalSearch = "${originalSearch}";
                const originalHref = "${originalHref}";
                const originalHash = "${originalHash}";
                const originalHost = "${originalHost}";
                const originalHostname = "${originalHostname}";
                const originalPort = "${originalPort}";
                const originalProtocol = "${originalProtocol}";
                const assetLookup = ${JSON.stringify(assetLookup)};
                
                const isLocal = (url) => {
                    if (typeof url !== 'string' || !url) return false;
                    const clean = url.split('?')[0].split('#')[0].toLowerCase();
                    return clean.includes('assets/') || clean.endsWith('index.html') || 
                           clean.startsWith('blob:') || clean.startsWith('data:') || 
                           clean.startsWith('file:') || clean.startsWith('filesystem:');
                };
                
                const proxyUrl = (url) => {
                    if (typeof url !== 'string' || !url) return url;
                    
                    // Handle srcset (multiple URLs)
                    if (url.includes(',') && /[ \\n\\r\\t]/.test(url)) {
                        return url.split(',').map(part => {
                            const trimmed = part.trim();
                            if (!trimmed) return part;
                            const match = trimmed.match(/^(\\S+)(.*)$/);
                            if (!match) return part;
                            return proxyUrl(match[1]) + match[2];
                        }).join(', ');
                    }

                    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#')) {
                        return url;
                    }
                    
                    try {
                        const absUrl = new URL(url, window.location.href.includes('index.html') ? origin + originalPath : window.location.href).href;
                        
                        const lookupUrl = absUrl.split('#')[0];
                        if (assetLookup[absUrl]) return assetLookup[absUrl];
                        if (assetLookup[lookupUrl]) return assetLookup[lookupUrl] + (new URL(absUrl).hash || '');
                        if (absUrl.startsWith('http') && !absUrl.startsWith(origin)) return absUrl;
                        if (isLocal(url)) return url;

                        console.warn('catCloner: Remote resource detected (not cloned) ->', absUrl);
                        return new URL(url, origin).href;
                    } catch (e) {
                        return url;
                    }
                };

                // Proxy Fetch
                const oldFetch = window.fetch;
                window.fetch = function(input, init) {
                    let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : input);
                    const newUrl = proxyUrl(url);
                    
                    if (typeof input === 'string') {
                        input = newUrl;
                    } else if (input instanceof Request) {
                        if (newUrl !== input.url) {
                            input = new Request(newUrl, input);
                        }
                    }

                    if (newUrl.startsWith(origin)) {
                        init = init || {};
                        init.credentials = init.credentials || 'include';
                    }
                    return oldFetch(input, init);
                };

                // Proxy XHR
                const oldOpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method, url) {
                    const args = Array.from(arguments);
                    args[1] = proxyUrl(url);
                    return oldOpen.apply(this, args);
                };

                // Proxy Element.setAttribute
                const oldSetAttribute = Element.prototype.setAttribute;
                Element.prototype.setAttribute = function(name, value) {
                    const attr = name.toLowerCase();
                    if (['src', 'href', 'srcset', 'poster', 'data-src', 'data-srcset', 'data-original', 'data-zoom'].includes(attr)) {
                        value = proxyUrl(value);
                    }
                    if (['integrity', 'nonce', 'crossorigin'].includes(attr)) {
                        return;
                    }
                    return oldSetAttribute.call(this, name, value);
                };

                // Proxy properties on prototypes
                const proxyProp = (proto, prop) => {
                    try {
                        const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
                        if (descriptor && descriptor.set) {
                            Object.defineProperty(proto, prop, {
                                set: function(val) { descriptor.set.call(this, proxyUrl(val)); },
                                get: function() { return descriptor.get.call(this); },
                                enumerable: true, configurable: true
                            });
                        }
                    } catch(e) {}
                };
                
                const blockProp = (proto, prop) => {
                    try {
                        Object.defineProperty(proto, prop, {
                            set: function() { },
                            get: function() { return null; },
                            enumerable: true, configurable: true
                        });
                    } catch(e) {}
                };

                proxyProp(HTMLScriptElement.prototype, 'src');
                proxyProp(HTMLImageElement.prototype, 'src');
                proxyProp(HTMLImageElement.prototype, 'srcset');
                proxyProp(HTMLLinkElement.prototype, 'href');
                proxyProp(HTMLIFrameElement.prototype, 'src');
                proxyProp(HTMLSourceElement.prototype, 'src');
                proxyProp(HTMLSourceElement.prototype, 'srcset');
                proxyProp(HTMLVideoElement.prototype, 'src');
                proxyProp(HTMLVideoElement.prototype, 'poster');
                proxyProp(HTMLAudioElement.prototype, 'src');
                
                const mockLocationProp = (prop, value) => {
                    try {
                        Object.defineProperty(Location.prototype, prop, {
                            get: function() { return value; },
                            set: function(v) { console.log('catCloner: Tentativa de mudar location.' + prop + ' ->', v); },
                            enumerable: true, configurable: true
                        });
                    } catch(e) {}
                };

                mockLocationProp('href', originalHref);
                mockLocationProp('pathname', originalPath);
                mockLocationProp('search', originalSearch);
                mockLocationProp('hash', originalHash);
                mockLocationProp('host', originalHost);
                mockLocationProp('hostname', originalHostname);
                mockLocationProp('port', originalPort);
                mockLocationProp('protocol', originalProtocol);
                mockLocationProp('origin', origin);
                
                Location.prototype.toString = function() { return originalHref; };
                Location.prototype.valueOf = function() { return originalHref; };
                try { Location.prototype[Symbol.toPrimitive] = () => originalHref; } catch(e) {}

                blockProp(HTMLScriptElement.prototype, 'integrity');
                blockProp(HTMLLinkElement.prototype, 'integrity');
                blockProp(HTMLImageElement.prototype, 'crossOrigin');
                blockProp(HTMLScriptElement.prototype, 'crossOrigin');

                // Bloquear History API e simular estado
                let fakeState = null;
                window.history.pushState = function(state, title, url) {
                    fakeState = state;
                    console.log('catCloner: pushState bloqueado ->', url);
                };
                window.history.replaceState = function(state, title, url) {
                    fakeState = state;
                    console.log('catCloner: replaceState bloqueado ->', url);
                };
                try {
                    Object.defineProperty(window.history, 'state', {
                        get: () => fakeState,
                        configurable: true
                    });
                } catch(e) {}
                
                // Impedir redirecionamentos e reload
                Location.prototype.assign = function(url) { console.log('catCloner: assign bloqueado ->', url); };
                Location.prototype.replace = function(url) { console.log('catCloner: replace bloqueado ->', url); };
                Location.prototype.reload = function() { console.log('catCloner: reload bloqueado'); };
                window.location.assign = function(url) { console.log('catCloner: assign bloqueado ->', url); };
                window.location.replace = function(url) { console.log('catCloner: replace bloqueado ->', url); };
                window.location.reload = function() { console.log('catCloner: reload bloqueado'); };
                
                // Mock additional document properties
                try {
                    Object.defineProperty(document, 'URL', { get: () => originalHref, configurable: true });
                    Object.defineProperty(document, 'referrer', { get: () => origin, configurable: true });
                    Object.defineProperty(document, 'baseURI', { get: () => originalHref, configurable: true });
                } catch(e) {}
                
                // Interceptar Worker com Blob para cross-origin
                const OldWorker = window.Worker;
                window.Worker = function(url, options) {
                    const proxiedUrl = proxyUrl(url);
                    if (proxiedUrl.startsWith('http')) {
                        const blob = new Blob(['importScripts("' + proxiedUrl + '");'], {type: 'application/javascript'});
                        return new OldWorker(URL.createObjectURL(blob), options);
                    }
                    return new OldWorker(proxiedUrl, options);
                };

                // Interceptar sendBeacon
                if (navigator.sendBeacon) {
                    const oldSendBeacon = navigator.sendBeacon;
                    navigator.sendBeacon = function(url, data) {
                        return oldSendBeacon.call(navigator, proxyUrl(url), data);
                    };
                }

                // Interceptar window.open
                const oldOpenWin = window.open;
                window.open = function(url, name, specs) {
                    return oldOpenWin.call(window, proxyUrl(url), name, specs);
                };

                // Desativar Service Workers
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(regs => {
                        regs.forEach(reg => reg.unregister());
                    });
                    navigator.serviceWorker.register = function() {
                        return new Promise(() => {});
                    };
                }

                // Interceptar cliques em links
                document.addEventListener('click', e => {
                    let target = e.target.closest('a');
                    if (target && target.href) {
                        const absUrl = new URL(target.href, window.location.href).href;
                        
                        // Allow navigation to local cloned pages
                        const lookupUrl = absUrl.split('#')[0];
                        const localPage = assetLookup[absUrl] || assetLookup[lookupUrl];
                        if (localPage && localPage.endsWith('.html')) {
                            e.preventDefault();
                            window.location.href = localPage + (new URL(absUrl).hash || '');
                            return;
                        }

                        if (!isLocal(absUrl) && !absUrl.startsWith('#') && !absUrl.startsWith('javascript:')) {
                            e.preventDefault();
                            console.log('catCloner: Clique bloqueado ->', absUrl);
                        }
                    }
                }, true);

                // Mock Location para enganar roteadores SPA
                try {
                    const fakeLocation = new Proxy(window.location, {
                        get(target, prop) {
                            if (prop === 'pathname') return originalPath;
                            if (prop === 'search') return originalSearch;
                            if (prop === 'href') return originalHref;
                            if (prop === 'origin') return origin;
                            let val = target[prop];
                            return typeof val === 'function' ? val.bind(target) : val;
                        },
                        set(target, prop, value) {
                            console.log('catCloner: Tentativa de mudar location.' + prop + ' ->', value);
                            return true;
                        }
                    });
                    
                    Object.defineProperty(window, 'location', {
                        get: () => fakeLocation,
                        configurable: true
                    });
                } catch(e) {}

                // MutationObserver para limpeza e proxy dinâmico
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                ['integrity', 'nonce', 'crossorigin'].forEach(attr => node.removeAttribute(attr));
                                
                                const lazyAttrs = ['data-src', 'data-srcset', 'data-original', 'data-lazy', 'data-lazy-src', 'data-zoom'];
                                const checkAndProxy = (el) => {
                                    if (['SCRIPT', 'IMG', 'LINK', 'IFRAME', 'SOURCE', 'VIDEO', 'AUDIO'].includes(el.tagName)) {
                                        const attr = el.tagName === 'LINK' ? 'href' : 'src';
                                        const val = el.getAttribute(attr);
                                        if (val) el.setAttribute(attr, proxyUrl(val));
                                        if (el.tagName === 'SOURCE' || el.tagName === 'IMG') {
                                            const ss = el.getAttribute('srcset');
                                            if (ss) el.setAttribute('srcset', proxyUrl(ss));
                                        }
                                    }
                                    lazyAttrs.forEach(a => {
                                        const v = el.getAttribute(a);
                                        if (v) {
                                            const target = a.includes('srcset') ? 'srcset' : 'src';
                                            el.setAttribute(target, proxyUrl(v));
                                            el.removeAttribute(a);
                                        }
                                    });
                                };
                                
                                checkAndProxy(node);
                                node.querySelectorAll('*').forEach(checkAndProxy);
                            }
                        });
                    });
                });
                observer.observe(document.documentElement, { childList: true, subtree: true });
                
                console.log('catCloner offline compatibility engine applied');
            })();
        `;
        snapshotDocument.head.prepend(fixScript);

        // Remove base tag
        snapshotDocument.querySelectorAll('base').forEach(base => base.remove());

        return {
            html: snapshotDocument.documentElement.outerHTML,
            title: document.title,
            url: window.location.href,
            links: discoveredLinks,
            assets: Array.from(assetMap.entries()).map(([url, data]) => ({ originalUrl: url, ...data })),
            diagnostics: {
                textLength: snapshotDocument.body?.innerText?.trim().length || 0,
                elementCount: snapshotDocument.body?.getElementsByTagName('*').length || 0,
                imageCount: snapshotDocument.images?.length || 0,
                assetCount: assetMap.size,
                discoveredLinkCount: discoveredLinks.length
            }
        };
    };

    const mainCaptchaResolved = await waitForCaptchaResolution(tabId);
    assertNotCancelled();
    if (mainCaptchaResolved) await showCloneOverlayV4(tabId);
    await loadCaptureEngines(tabId);
    const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: extractionFunc
    });

    if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) {
        throw new Error("Could not extract page data.");
    }

    const mainData = injectionResults[0].result;
    if (isCaptchaUrl(mainData.url)) {
        throw new Error("Shopee blocked capture and displayed traffic verification. Sign in, complete verification in your browser and try again.");
    }
    mainData.filename = "index.html";
    const allPages = [mainData];
    const pageMap = { [normalizePageUrl(mainData.url)]: "index.html" };
    const pageFailures = [];

    // Breadth-first discovery of same-origin sub-pages.
    const visitedPages = new Set([normalizePageUrl(mainData.url)]);
    const queuedPages = new Set();
    const pageQueue = [];

    function normalizePageUrl(value) {
        try {
            const url = new URL(value);
            url.hash = '';
            return url.href;
        } catch {
            return value;
        }
    }

    function enqueueLinks(links, depth) {
        if (depth > maxDepth) return;
        for (const link of links || []) {
            const normalized = normalizePageUrl(link);
            if (visitedPages.has(normalized) || queuedPages.has(normalized)) continue;
            queuedPages.add(normalized);
            pageQueue.push({ url: normalized, depth });
        }
    }

    async function waitForRenderedPage(targetTabId, pageUrl) {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            args: [pageUrl],
            func: async (url) => {
                const isShopeeProduct = /shopee\./i.test(url) && /-i\.\d+\.\d+/i.test(url);
                const deadline = Date.now() + 30000;
                let previousFingerprint = '';
                let stableSamples = 0;

                while (Date.now() < deadline) {
                    const textLength = document.body?.innerText?.trim().length || 0;
                    const imageCount = document.images?.length || 0;
                    const elementCount = document.body?.getElementsByTagName('*').length || 0;
                    if (/\/verify\/(?:captcha|traffic)(?:\/|\?|$)/i.test(location.href)) {
                        return { ready: false, captcha: true, textLength, imageCount, elementCount };
                    }
                    const pdpRoot = document.getElementById('sll2-normal-pdp-main');
                    const hasProductRoot = !isShopeeProduct || Boolean(
                        pdpRoot?.childElementCount > 0 ||
                        document.querySelector('[data-testid*="product"], [class*="product-briefing"]')
                    );
                    const hasEnoughImages = isShopeeProduct ? imageCount > 5 : imageCount > 0;
                    const hasGenericContent = textLength > 120 || elementCount > 25;
                    const fingerprint = `${textLength}:${imageCount}:${elementCount}`;
                    stableSamples = fingerprint === previousFingerprint ? stableSamples + 1 : 0;
                    previousFingerprint = fingerprint;
                    const documentReady = document.readyState === 'complete' || document.readyState === 'interactive';
                    const siteReady = isShopeeProduct
                        ? hasProductRoot && textLength > 600 && hasEnoughImages
                        : hasGenericContent;
                    if (documentReady && siteReady && stableSamples >= 2) {
                        return { ready: true, textLength, imageCount, elementCount, stableSamples };
                    }
                    await new Promise(resolve => setTimeout(resolve, 650));
                }

                return {
                    ready: false,
                    textLength: document.body?.innerText?.trim().length || 0,
                    imageCount: document.images?.length || 0,
                    elementCount: document.body?.getElementsByTagName('*').length || 0,
                    productRootChildren: document.getElementById('sll2-normal-pdp-main')?.childElementCount || 0
                };
            }
        });
        return result?.result || { ready: false };
    }

    enqueueLinks(mainData.links, 1);
    notifyPopup(`${pageQueue.length} product(s) found.`, 5);
    while (pageQueue.length > 0 && allPages.length < pageLimit) {
            assertNotCancelled();
            const nextPage = pageQueue.shift();
            queuedPages.delete(nextPage.url);
            if (visitedPages.has(nextPage.url)) continue;
            visitedPages.add(nextPage.url);
            const link = nextPage.url;
            notifyPopup(`Exploring page ${allPages.length + 1}/${pageLimit}...`, 5 + Math.round((allPages.length / pageLimit) * 20));
            let subTab = null;
            try {
                const isShopeeProduct = /shopee\./i.test(link) && /-i\.\d+\.\d+/i.test(link);
                subTab = await chrome.tabs.create({ url: link, active: isShopeeProduct });
                await new Promise(resolve => {
                    const listener = (tid, info) => {
                        if (tid === subTab.id && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                    // Timeout fallback
                    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 15000);
                });
                
                await waitForCaptchaResolution(subTab.id);
                await showCloneOverlayV4(subTab.id);
                let readiness = await waitForRenderedPage(subTab.id, link);
                if (readiness.captcha) {
                    await waitForCaptchaResolution(subTab.id);
                    await showCloneOverlayV4(subTab.id);
                    readiness = await waitForRenderedPage(subTab.id, link);
                }
                if (!readiness.ready) {
                    throw new Error(`The page did not render enough content (${readiness.textLength || 0} characters, ${readiness.imageCount || 0} images).`);
                }
                // Allow late price blocks and image galleries to finish hydrating.
                await new Promise(resolve => setTimeout(resolve, isShopeeProduct ? 2500 : 1000));
                await loadCaptureEngines(subTab.id);
                const subResults = await chrome.scripting.executeScript({ target: { tabId: subTab.id }, func: extractionFunc });
                if (subResults && subResults[0].result) {
                    const subData = subResults[0].result;
                    const hash = stableHash(link);
                    subData.filename = `p_${hash}.html`;
                    pageMap[link] = subData.filename;
                    pageMap[normalizePageUrl(subData.url)] = subData.filename;
                    allPages.push(subData);
                    enqueueLinks(subData.links, nextPage.depth + 1);
                }
            } catch (e) {
                console.warn("Error cloning link:", link, e);
                pageFailures.push({
                    url: link,
                    error: e instanceof Error ? e.message : String(e)
                });
            } finally {
                if (subTab?.id) {
                    await chrome.tabs.remove(subTab.id).catch(() => {});
                }
                await chrome.tabs.update(tabId, { active: true }).catch(() => {});
            }
    }

    notifyPopup("Consolidating assets and routes...", 30);
    
    const combinedAssetLookup = {};
    allPages.forEach(p => {
        p.assets.forEach(a => combinedAssetLookup[a.originalUrl] = a.localPath);
    });
    Object.keys(pageMap).forEach(url => combinedAssetLookup[url] = pageMap[url]);

    // Update all HTMLs with combined lookup
    allPages.forEach(p => {
        const lookupJson = JSON.stringify(combinedAssetLookup);
        p.html = p.html.replace(/const assetLookup = \{.*?\};/, `const assetLookup = ${lookupJson};`);
    });

    const folderName = mainData.title.replace(/[^a-z0-9à-úáéíóúãõç_\s-]/gi, '').trim().replace(/\s+/g, '_').toLowerCase().substring(0, 50) || 'site_cloned';
    await ensureZipDocument();
    await sendZipMessage({ action: "zipStart" });

    // Save all HTML pages
    for (const p of allPages) {
        await sendZipMessage({ action: "zipAddFile", path: p.filename, data: p.html });
    }

    // Process CSS and JS files for nested assets recursively
    const allAssets = [];
    const processedUrls = new Set();
    allPages.forEach(p => {
        p.assets.forEach(a => {
            if (!processedUrls.has(a.originalUrl)) {
                processedUrls.add(a.originalUrl);
                allAssets.push(a);
            }
        });
    });
    
    const finalContents = new Map();
    const downloadMetadata = new Map();

    function stableHash(value) {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36).padStart(7, '0');
    }

    async function fetchWithRetry(url, attempts = 3) {
        let lastError;
        for (let attempt = 0; attempt < attempts; attempt++) {
            const controller = new AbortController();
            if (!cloneAbortControllers.has(tabId)) cloneAbortControllers.set(tabId, new Set());
            cloneAbortControllers.get(tabId).add(controller);
            const timeoutId = setTimeout(() => controller.abort(), 15000 + (attempt * 5000));
            try {
                const response = await fetch(url, {
                    signal: controller.signal,
                    credentials: attempt === 1 ? 'omit' : 'include',
                    cache: attempt === 2 ? 'reload' : 'default',
                    redirect: 'follow'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                downloadMetadata.set(url, {
                    status: response.status,
                    finalUrl: response.url,
                    contentType: response.headers.get('content-type') || null
                });
                return response;
            } catch (error) {
                lastError = error;
                if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
            } finally {
                clearTimeout(timeoutId);
                cloneAbortControllers.get(tabId)?.delete(controller);
            }
        }
        throw lastError || new Error('Network failure');
    }

    async function processDeep(asset, depth = 0) {
        if (depth > 5) return null; // Prevent infinite loops
        if (finalContents.has(asset.originalUrl)) return finalContents.get(asset.originalUrl);

        try {
            const response = await fetchWithRetry(asset.originalUrl);
            const contentType = response.headers.get('content-type') || '';
            if (/text\/html/i.test(contentType)) throw new Error('Server returned HTML instead of CSS');
            let content = await response.text();

            if (asset.type === 'css') {
                const urlRegex = /url\(\s*['"]?([^'"]+?)['"]?\s*\)/g;
                const importRegex = /@import\s+(?:url\(\s*['"]?)?([^'"]+?)(?:['"]?\s*\))?;/g;
                
                // Handle @import
                content = content.replace(importRegex, (match, url) => {
                    try {
                        const absUrl = new URL(url, asset.originalUrl).href;
                        const hash = stableHash(absUrl);
                        const baseName = absUrl.substring(absUrl.lastIndexOf('/') + 1).split('?')[0].split('#')[0] || 'asset';
                        const safeBaseName = baseName.replace(/[^a-z0-9._-]/gi, '_');
                        const filename = `${hash}_${safeBaseName}${safeBaseName.toLowerCase().endsWith('.css') ? '' : '.css'}`;
                        
                        if (!processedUrls.has(absUrl)) {
                            processedUrls.add(absUrl);
                            allAssets.push({ originalUrl: absUrl, filename, subfolder: 'css', type: 'css', localPath: `assets/css/${filename}` });
                            // We don't await processDeep here to avoid complexity in replace callback,
                            // but allAssets will be processed in the main loop anyway
                        }
                        return `@import url("../css/${filename}");`;
                    } catch (e) {
                        return match;
                    }
                });

                // Handle url()
                content = content.replace(urlRegex, (match, url) => {
                    if (url.startsWith('date:') || url.startsWith('blob:') || url.startsWith('#')) return match;
                    try {
                        const absUrl = new URL(url, asset.originalUrl).href;
                        const type = /\.(woff2?|ttf|otf|eot)/i.test(url) ? 'font' : 'image';
                        
                        const filename = getDeterministicFilename(absUrl, type);
                        const subfolder = type === 'image' ? 'images' : 'fonts';
                        
                        if (!processedUrls.has(absUrl)) {
                            processedUrls.add(absUrl);
                            allAssets.push({ originalUrl: absUrl, filename, subfolder, type, localPath: `assets/${subfolder}/${filename}` });
                        }
                        return `url("../${subfolder}/${filename}")`;
                    } catch (e) {
                        return match;
                    }
                });
            }
            
            finalContents.set(asset.originalUrl, content);
            return content;
        } catch (e) {
            console.error(`Error processing ${asset.originalUrl}:`, e);
            return null;
        }
    }

    function getDeterministicFilename(urlStr, type) {
        const ext = type === 'image' ? 'png' : (type === 'css' ? 'css' : (type === 'font' ? 'woff2' : 'bin'));
        const hash = stableHash(urlStr);
        const baseName = urlStr.substring(urlStr.lastIndexOf('/') + 1).split('?')[0].split('#')[0] || 'asset';
        const safeBaseName = baseName.replace(/[^a-z0-9._-]/gi, '_');
        const expectedSuffix = `.${ext}`;
        return `${hash}_${safeBaseName}${safeBaseName.toLowerCase().endsWith(expectedSuffix) ? '' : expectedSuffix}`;
    }

    // Initial deep process for CSS assets found in HTML (handles nested imports recursively)
    for (let i = 0; i < allAssets.length; i++) {
        assertNotCancelled();
        const asset = allAssets[i];
        if (asset.type === 'css') {
            await processDeep(asset);
        }
    }

    // Download all assets
    let downloadedCount = 0;
    let successfulDownloads = 0;
    const failedDownloads = [];
    const CONCURRENCY = 10;

    async function downloadAsset(asset) {
        try {
            assertNotCancelled();
            downloadedCount++;
            const progress = 35 + Math.round((downloadedCount / allAssets.length) * 65);
            notifyPopup(`Downloading: ${asset.filename}`, progress);
            
            let data;
            if (finalContents.has(asset.originalUrl)) {
                data = finalContents.get(asset.originalUrl);
            } else {
                const resp = await fetchWithRetry(asset.originalUrl);
                data = await resp.blob();
            }

            const subfolder = asset.subfolder || 'misc';
            if (typeof data === "string") {
                await sendZipMessage({
                    action: "zipAddFile",
                    path: `assets/${subfolder}/${asset.filename}`,
                    data
                });
            } else {
                await sendZipMessage({
                    action: "zipAddFile",
                    path: `assets/${subfolder}/${asset.filename}`,
                    data: await blobToBase64(data),
                    base64: true
                });
            }
            successfulDownloads++;
        } catch (err) {
            console.warn("Asset download error:", asset.originalUrl, err);
            failedDownloads.push({
                url: asset.originalUrl,
                localPath: asset.localPath,
                type: asset.type,
                error: err instanceof Error ? err.message : String(err)
            });
        }
    }

    const queue = [...allAssets];
    async function worker() {
        while (queue.length > 0) {
            assertNotCancelled();
            const asset = queue.shift();
            if (asset) await downloadAsset(asset);
        }
    }

    await Promise.all(Array(CONCURRENCY).fill(0).map(() => worker()));
    assertNotCancelled();

    const report = {
        sourceUrl: mainData.url,
        createdAt: new Date().toISOString(),
        engineVersion: CatClonerCore.version,
        settings: { pageLimit, maxDepth },
        pages: allPages.map(page => ({ url: page.url, file: page.filename, diagnostics: page.diagnostics })),
        pageFailures,
        assets: {
            discovered: allAssets.length,
            downloaded: successfulDownloads,
            failed: failedDownloads.length
        },
        failures: failedDownloads,
        downloadMetadata: Object.fromEntries(downloadMetadata)
    };
    await sendZipMessage({
        action: "zipAddFile",
        path: "clone-report.json",
        data: JSON.stringify(report, null, 2)
    });

    notifyPopup("Compressing clone...", 99);
    assertNotCancelled();
    const finalizedZip = await sendZipMessage({
        action: "zipFinalize",
        filename: `catCloner/${folderName}.zip`
    });
    if (!finalizedZip.blobUrl) throw new Error("The compression engine did not return a ZIP file.");
    await chrome.downloads.download({
        url: finalizedZip.blobUrl,
        filename: `catCloner/${folderName}.zip`,
        conflictAction: "uniquify",
        saveAs: false
    });

    const completionText = failedDownloads.length > 0
        ? `Clone finished with ${failedDownloads.length} missing resource(s).`
        : "Clone complete!";
    notifyPopup(completionText, 100);
}
