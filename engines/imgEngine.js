(function initializeImgEngine(global) {
    'use strict';

    function process(snapshot, registerAsset) {
        snapshot.querySelectorAll('img, source, [data-src], [data-srcset], [data-zoom]').forEach(element => {
            const attributes = ['data-catcloner-current-src', 'data-zoom', 'data-original', 'data-src', 'data-lazy', 'data-lazy-src', 'data-srcset', 'srcset', 'src'];
            let bestSource = null;
            for (const attribute of attributes) {
                const value = element.getAttribute(attribute);
                if (value && !value.startsWith('data:') && !value.startsWith('blob:')) {
                    bestSource = value;
                    break;
                }
            }
            if (bestSource && bestSource.includes(',')) {
                const parts = bestSource.split(',').map(part => {
                    const match = part.trim().match(/^(\S+)(.*)$/);
                    if (!match) return part;
                    const localPath = registerAsset(match[1], 'image');
                    return localPath ? `${localPath}${match[2] || ''}` : part;
                });
                const srcset = parts.join(', ');
                if (element.tagName === 'SOURCE' || element.hasAttribute('srcset') || element.hasAttribute('data-srcset')) element.setAttribute('srcset', srcset);
                if (element.tagName === 'IMG') element.setAttribute('src', parts[0].split(' ')[0]);
            } else if (bestSource) {
                const localPath = registerAsset(bestSource, 'image');
                if (localPath && element.tagName === 'IMG') {
                    element.setAttribute('src', localPath);
                    element.removeAttribute('srcset');
                } else if (localPath) element.setAttribute('srcset', localPath);
            }
            ['data-catcloner-current-src', 'data-src', 'data-srcset', 'data-original', 'data-lazy', 'data-lazy-src', 'data-zoom'].forEach(attribute => element.removeAttribute(attribute));
        });
    }

    global.CatClonerImgEngine = Object.freeze({ process });
})(globalThis);
