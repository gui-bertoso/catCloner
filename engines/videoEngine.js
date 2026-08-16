(function initializeVideoEngine(global) {
    'use strict';

    function process(snapshot, registerAsset) {
        snapshot.querySelectorAll('video, audio, video source, audio source').forEach(element => {
            const source = element.getAttribute('src');
            if (source) {
                const type = element.tagName === 'VIDEO' || (element.tagName === 'SOURCE' && element.parentElement?.tagName === 'VIDEO') ? 'video' : 'misc';
                const localPath = registerAsset(source, type);
                if (localPath) element.setAttribute('src', localPath);
            }
            if (element.tagName === 'VIDEO' && element.getAttribute('poster')) {
                const poster = registerAsset(element.getAttribute('poster'), 'image');
                if (poster) element.setAttribute('poster', poster);
            }
        });
    }

    global.CatClonerVideoEngine = Object.freeze({ process });
})(globalThis);
