(function initializeFlowEngine(global) {
    'use strict';
    const DB_NAME = 'catClonerFlow';
    const STORE = 'steps';
    let cancelled = false;
    const activeControllers = new Set();

    function openDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function transaction(mode, operation) {
        const db = await openDb();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, mode);
                const request = operation(tx.objectStore(STORE));
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } finally { db.close(); }
    }

    const list = () => transaction('readonly', store => store.getAll());
    const clear = () => transaction('readwrite', store => store.clear());
    const remove = async id => {
        await transaction('readwrite', store => store.delete(Number(id)));
        const remaining = (await list()).sort((a, b) => a.order - b.order);
        for (let index = 0; index < remaining.length; index++) {
            remaining[index].order = index + 1;
            await transaction('readwrite', store => store.put(remaining[index]));
        }
    };
    const setCancelled = value => {
        cancelled = Boolean(value);
        if (cancelled) activeControllers.forEach(controller => controller.abort());
    };
    const assertActive = () => { if (cancelled) throw new Error('FLOW_CANCELLED'); };

    async function capture(tabId, engineFiles) {
        assertActive();
        await chrome.scripting.executeScript({ target: { tabId }, files: engineFiles });
        const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => {
            const assets = new Map();
            const hash = value => {
                let number = 2166136261;
                for (let index = 0; index < value.length; index++) { number ^= value.charCodeAt(index); number = Math.imul(number, 16777619); }
                return (number >>> 0).toString(36).padStart(7, '0');
            };
            const registerAsset = (value, type) => {
                if (!value || /^(?:data:|blob:|#)/i.test(value)) return null;
                try {
                    const url = new URL(value, document.baseURI).href;
                    if (assets.has(url)) return assets.get(url).localPath;
                    const path = new URL(url).pathname;
                    const originalExt = path.includes('.') ? path.split('.').pop().toLowerCase() : '';
                    const ext = type === 'css' ? 'css' : type === 'font' ? (originalExt || 'woff2') : type === 'video' ? (originalExt || 'mp4') : type === 'image' ? (originalExt || 'png') : (originalExt || 'bin');
                    const folder = type === 'css' ? 'css' : type === 'font' ? 'fonts' : type === 'video' ? 'videos' : type === 'image' ? 'images' : 'misc';
                    const base = (path.split('/').pop() || 'asset').replace(/[^a-z0-9._-]/gi, '_').substring(0, 32);
                    const filename = `${hash(url)}_${base}${base.toLowerCase().endsWith(`.${ext}`) ? '' : `.${ext}`}`;
                    const data = { originalUrl: url, type, subfolder: folder, filename, localPath: `assets/${folder}/${filename}` };
                    assets.set(url, data);
                    return data.localPath;
                } catch (_) { return null; }
            };
            const snapshot = CatClonerHtmlEngine.createSnapshot(document);
            CatClonerHtmlEngine.sanitizeForms(snapshot);
            CatClonerPrivacyEngine.redactRenderedText(snapshot);
            CatClonerCssEngine.processLinks(snapshot, registerAsset);
            CatClonerImgEngine.process(snapshot, registerAsset);
            CatClonerCssEngine.processInlineStyles(snapshot, registerAsset);
            CatClonerVideoEngine.process(snapshot, registerAsset);
            CatClonerLinkEngine.discover(snapshot, location.href, 0);
            CatClonerJsEngine.neutralize(snapshot);
            snapshot.querySelectorAll('base').forEach(element => element.remove());
            return { title: document.title, productTitle: document.querySelector('h1,[itemprop="name"]')?.textContent?.trim() || '', url: location.href, html: snapshot.documentElement.outerHTML, assets: Array.from(assets.values()), createdAt: new Date().toISOString() };
        }});
        if (!result?.result) throw new Error('Não foi possível capturar esta etapa.');
        assertActive();
        const steps = await list();
        const step = { ...result.result, order: steps.length + 1 };
        step.id = await transaction('readwrite', store => store.add(step));
        return step;
    }

    function localFile(index) {
        return index === 0 ? 'index.html' : `step_${String(index + 1).padStart(2, '0')}.html`;
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function addNavigation(html, index, steps) {
        const total = steps.length;
        const previous = index > 0 ? (index === 1 ? 'index.html' : `step_${String(index).padStart(2, '0')}.html`) : null;
        const next = index < total - 1 ? `step_${String(index + 2).padStart(2, '0')}.html` : null;
        let rewritten = html;
        steps.forEach((step, stepIndex) => {
            const normalized = String(step.url || '').split('#')[0];
            if (!normalized) return;
            rewritten = rewritten.replace(new RegExp(`href=(['"])${escapeRegExp(normalized)}(?:#[^'"]*)?\\1`, 'gi'), `href="${localFile(stepIndex)}"`);
        });
        const interactionScript = `<script id="catcloner-safe-interactions">(()=>{
          const next=${JSON.stringify(next)},previous=${JSON.stringify(previous)},isCatalog=${index === 0},isProduct=${index === 1},templateTitle=${JSON.stringify(steps[1]?.productTitle || '')};
          const query=location.search||''; const withQuery=file=>file?(file+query):null;
          const clean=value=>(value||'').trim(); const normalized=value=>clean(value).toLowerCase();
          const forward=/continuar|avançar|próximo|proximo|finalizar|concluir|comprar|ir para|seguir|next|continue|finish|checkout/;
          const backward=/voltar|anterior|retornar|back|previous/; const productRoute=value=>{const route=(value||'').toLowerCase();return ['produto','product','/item/','/p/','/up/','-i.'].some(part=>route.includes(part))||/mlb[-_]?[0-9]+/i.test(route)};
          const selection=new URLSearchParams(location.search);
          const selected={title:selection.get('cc_title')||'',price:selection.get('cc_price')||'',image:selection.get('cc_image')||''};
          if(!isCatalog&&selected.title){
            if(templateTitle){const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(node=>{if(node.parentElement?.closest('script,style'))return;if((node.nodeValue||'').includes(templateTitle))node.nodeValue=node.nodeValue.replaceAll(templateTitle,selected.title)})}
            const titleTargets=isProduct?document.querySelectorAll('h1,[itemprop="name"]'):document.querySelectorAll('[class*="item" i] [class*="title" i],[class*="product" i] [class*="title" i]');
            if(titleTargets[0])titleTargets[0].textContent=selected.title;
            const priceTarget=document.querySelector('[itemprop="price"],[class*="price" i]'); if(priceTarget&&selected.price)priceTarget.textContent=selected.price;
            const imageTarget=document.querySelector('main [class*="gallery" i] img,main [class*="product" i] img,[class*="item" i] img'); if(imageTarget&&selected.image){imageTarget.src=selected.image;imageTarget.removeAttribute('srcset')}
          }
          document.addEventListener('submit',event=>{event.preventDefault();if(next)location.href=withQuery(next)});
          document.addEventListener('click',event=>{
            const anchor=event.target.closest('a[href]');
            if(isCatalog&&anchor&&productRoute(anchor.href)){
              const card=anchor.closest('article,li,[class*="card" i],[class*="item" i],[class*="product" i]')||anchor.parentElement;
              const title=clean(card?.querySelector('h2,h3,[class*="title" i]')?.textContent||anchor.getAttribute('title')||anchor.textContent);
              const price=clean(card?.querySelector('[class*="price" i]')?.textContent);
              const image=card?.querySelector('img')?.getAttribute('src')||'';
              if(title&&next){event.preventDefault();const params=new URLSearchParams({cc_title:title.substring(0,180),cc_price:price.substring(0,60),cc_image:image});location.href=next+'?'+params.toString();return}
            }
            const target=event.target.closest('button,[role="button"],[aria-controls]');
            if(!target)return; const controlled=target.getAttribute('aria-controls');
            if(controlled){const panel=document.getElementById(controlled);if(panel){const expanded=target.getAttribute('aria-expanded')==='true';target.setAttribute('aria-expanded',String(!expanded));panel.hidden=expanded;if(target.getAttribute('role')==='tab'){document.querySelectorAll('[role="tab"]').forEach(tab=>tab.setAttribute('aria-selected','false'));target.setAttribute('aria-selected','true')}return}}
            const label=normalized(target.innerText||target.getAttribute('aria-label')); if(backward.test(label)&&previous)location.href=withQuery(previous);else if(forward.test(label)&&next)location.href=withQuery(next)
          });
          document.querySelectorAll('input,textarea,select').forEach(field=>{field.removeAttribute('disabled');field.removeAttribute('readonly')});
        })();<\/script>`;
        const additions = interactionScript;
        return rewritten.includes('</body>') ? rewritten.replace('</body>', `${additions}</body>`) : `${rewritten}${additions}`;
    }

    async function finish() {
        assertActive();
        const steps = (await list()).sort((a, b) => a.order - b.order);
        if (!steps.length) throw new Error('Capture pelo menos uma etapa antes de finalizar.');
        await CatClonerZipEngine.ensureDocument();
        await CatClonerZipEngine.send({ action: 'zipStart' });
        for (let index = 0; index < steps.length; index++) {
            assertActive();
            const filename = index === 0 ? 'index.html' : `step_${String(index + 1).padStart(2, '0')}.html`;
            await CatClonerZipEngine.send({ action: 'zipAddFile', path: filename, data: addNavigation(steps[index].html, index, steps) });
        }
        const assets = new Map();
        steps.flatMap(step => step.assets || []).forEach(asset => assets.set(asset.originalUrl, asset));
        const failures = [];

        async function fetchWithRetry(url) {
            let lastError;
            for (let attempt = 0; attempt < 3; attempt++) {
                const controller = new AbortController();
                activeControllers.add(controller);
                const timeout = setTimeout(() => controller.abort(), 15000 + attempt * 5000);
                try {
                    const response = await fetch(url, { signal: controller.signal, credentials: attempt === 1 ? 'omit' : 'include', cache: attempt === 2 ? 'reload' : 'default', redirect: 'follow' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response;
                } catch (error) {
                    lastError = error;
                    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
                } finally { clearTimeout(timeout); activeControllers.delete(controller); }
            }
            throw lastError;
        }

        function nestedAsset(url, type) {
            const parsed = new URL(url);
            const original = parsed.pathname.split('/').pop() || 'asset';
            const extension = type === 'font' ? 'woff2' : type === 'css' ? 'css' : 'png';
            const safe = original.replace(/[^a-z0-9._-]/gi, '_').substring(0, 40);
            const filename = `${CatClonerCore.stableHash(url)}_${safe}${safe.includes('.') ? '' : `.${extension}`}`;
            const subfolder = type === 'font' ? 'fonts' : type === 'css' ? 'css' : 'images';
            const asset = { originalUrl: url, type, filename, subfolder, localPath: `assets/${subfolder}/${filename}` };
            if (!assets.has(url)) assets.set(url, asset);
            return asset;
        }

        for (const asset of assets.values()) {
            assertActive();
            try {
                const response = await fetchWithRetry(asset.originalUrl);
                if (asset.type === 'css') {
                    const contentType = response.headers.get('content-type') || '';
                    if (/text\/html/i.test(contentType)) throw new Error('Servidor retornou HTML no lugar do CSS');
                    let css = await response.text();
                    css = css.replace(/@import\s+(?:url\(\s*)?['"]?([^'"\)\s;]+)['"]?\s*\)?\s*;/g, (match, value) => {
                        try {
                            const nested = nestedAsset(new URL(value, asset.originalUrl).href, 'css');
                            return `@import url("../css/${nested.filename}");`;
                        } catch (_) { return match; }
                    });
                    css = css.replace(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g, (match, value) => {
                        if (/^(?:data:|blob:|#)/i.test(value)) return match;
                        try {
                            const absolute = new URL(value, asset.originalUrl).href;
                            const type = /\.(?:woff2?|ttf|otf|eot)(?:\?|$)/i.test(value) ? 'font' : 'image';
                            const nested = nestedAsset(absolute, type);
                            return `url("../${nested.subfolder}/${nested.filename}")`;
                        } catch (_) { return match; }
                    });
                    await CatClonerZipEngine.send({ action: 'zipAddFile', path: asset.localPath, data: css });
                } else {
                    const blob = await response.blob();
                    await CatClonerZipEngine.send({ action: 'zipAddFile', path: asset.localPath, data: await CatClonerZipEngine.blobToBase64(blob), base64: true });
                }
            } catch (error) { failures.push({ url: asset.originalUrl, error: error instanceof Error ? error.message : String(error) }); }
        }
        assertActive();
        await CatClonerZipEngine.send({ action: 'zipAddFile', path: 'flow-report.json', data: JSON.stringify({ engineVersion: CatClonerCore.version, steps: steps.map(({ title, url, order }) => ({ title, url: CatClonerPrivacyEngine.sanitizeUrl(url), order })), assets: assets.size, failures: failures.map(failure => ({ ...failure, url: CatClonerPrivacyEngine.sanitizeUrl(failure.url) })) }, null, 2) });
        const result = await CatClonerZipEngine.send({ action: 'zipFinalize', filename: 'catCloner/visual-flow.zip' });
        if (!result.blobUrl) throw new Error('O compactador não retornou o fluxo.');
        await chrome.downloads.download({ url: result.blobUrl, filename: 'catCloner/visual-flow.zip', conflictAction: 'uniquify', saveAs: false });
        return { steps: steps.length, failures: failures.length };
    }

    global.CatClonerFlowEngine = Object.freeze({ clear, list, remove, capture, finish, setCancelled });
})(globalThis);
