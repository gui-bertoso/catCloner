console.log('catCloner interface initialized.');

document.addEventListener('DOMContentLoaded', async () => {
    const titleDisplay = document.getElementById('pageTitleDisplay');
    const urlDisplay = document.getElementById('pageUrlDisplay');
    const siteInitial = document.getElementById('siteInitial');
    const cloneBtn = document.getElementById('cloneBtn');
    const buttonTitle = cloneBtn.querySelector('.button-copy strong');
    const buttonSubtitle = cloneBtn.querySelector('.button-copy small');
    const statusBox = document.getElementById('statusMessage');
    const statusText = document.getElementById('statusText');
    const statusHint = document.getElementById('statusHint');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const pageLimitInput = document.getElementById('pageLimit');
    const maxDepthInput = document.getElementById('maxDepth');
    const snapshotModeBtn = document.getElementById('snapshotModeBtn');
    const flowModeBtn = document.getElementById('flowModeBtn');
    const snapshotPanel = document.getElementById('snapshotPanel');
    const flowPanel = document.getElementById('flowPanel');
    const flowSteps = document.getElementById('flowSteps');
    const flowStartBtn = document.getElementById('flowStartBtn');
    const flowCaptureBtn = document.getElementById('flowCaptureBtn');
    const flowFinishBtn = document.getElementById('flowFinishBtn');
    const flowRecorderState = document.getElementById('flowRecorderState');
    const flowResetBtn = document.getElementById('flowResetBtn');
    const cancelCloneBtn = document.getElementById('cancelCloneBtn');
    let currentTab = null;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            currentTab = tab;
            titleDisplay.textContent = tab.title || 'Untitled page';
            urlDisplay.textContent = tab.url || '';
            try {
                const hostname = new URL(tab.url).hostname.replace(/^www\./, '');
                siteInitial.textContent = hostname.charAt(0) || '•';
            } catch (_) {}
        }
    } catch (error) {
        console.error('Error fetching the active tab:', error);
    }

    try {
        const saved = await chrome.storage.local.get('catClonerPopupMode');
        const initialMode = saved.catClonerPopupMode === 'flow' ? 'flow' : 'snapshot';
        setMode(initialMode, false);
        if (initialMode === 'flow') await refreshFlow();
    } catch (_) {
        setMode('snapshot', false);
    }

    snapshotModeBtn.addEventListener('click', () => setMode('snapshot'));
    flowModeBtn.addEventListener('click', async () => {
        setMode('flow');
        await refreshFlow();
    });
    flowStartBtn.addEventListener('click', async () => {
        if (!currentTab) return;
        await runFlowAction(flowStartBtn, 'flowStart', 'Recording started.', { tabId: currentTab.id });
    });
    flowCaptureBtn.addEventListener('click', async () => {
        if (!currentTab) return;
        await runFlowAction(flowCaptureBtn, 'flowCapture', 'Screen captured.', { tabId: currentTab.id });
    });
    flowFinishBtn.addEventListener('click', async () => runFlowAction(flowFinishBtn, 'flowFinish', 'Flow downloaded.'));
    flowResetBtn.addEventListener('click', async () => {
        if (!confirm('Cancel recording and delete all steps?')) return;
        await runFlowAction(flowResetBtn, 'flowReset', 'Session cleared.');
    });
    flowSteps.addEventListener('click', async event => {
        const button = event.target.closest('[data-delete-step]');
        if (!button) return;
        await runFlowAction(button, 'flowDelete', 'Deleted.', { stepId: Number(button.dataset.deleteStep) });
    });
    cancelCloneBtn.addEventListener('click', async () => {
        if (!currentTab) return;
        cancelCloneBtn.disabled = true;
        cancelCloneBtn.textContent = 'Canceling…';
        statusText.textContent = 'Canceling capture and downloads…';
        try { await send({ action: 'cancelClone', tabId: currentTab.id }); }
        catch (error) { alert(`Could not cancel: ${error.message}`); resetUI(); }
    });

    cloneBtn.addEventListener('click', () => {
        if (!currentTab) return;
        if (/^(chrome|edge):\/\//.test(currentTab.url || '')) {
            alert('Internal browser pages cannot be cloned.');
            return;
        }

        setRunning(true);
        chrome.runtime.sendMessage({
            action: 'startClone',
            tabId: currentTab.id,
            options: {
                pageLimit: clampNumber(pageLimitInput.value, 1, 100, 6),
                maxDepth: clampNumber(maxDepthInput.value, 0, 5, 1)
            }
        }, response => {
            if (chrome.runtime.lastError) {
                alert(`Engine communication error: ${chrome.runtime.lastError.message}`);
                resetUI();
            } else if (response && !response.success) {
                alert(`Process error: ${response.error}`);
                resetUI();
            }
        });
    });

    chrome.runtime.onMessage.addListener(request => {
        if (request.action === 'updateStatus') {
            const progress = Number.isFinite(request.progress) ? request.progress : 0;
            const captcha = /captcha/i.test(request.text || '');
            statusText.textContent = request.text;
            progressBar.style.width = `${progress}%`;
            progressPercent.textContent = `${Math.round(progress)}%`;
            statusBox.classList.toggle('captcha', captcha);
            statusHint.textContent = captcha
                ? 'Complete verification on the page; capture will resume automatically.'
                : 'Keep the tab open during the process.';
            if (progress === 100) setTimeout(() => window.close(), 2000);
        } else if (request.action === 'cloneFailed') {
            alert(`Process error: ${request.error}`);
            resetUI();
        } else if (request.action === 'cloneCancelled') {
            resetUI();
        } else if (request.action === 'flowStepCaptured') {
            refreshFlow().catch(() => {});
        }
    });

    function setRunning(running) {
        cloneBtn.disabled = running;
        statusBox.classList.toggle('hidden', !running);
        buttonTitle.textContent = running ? 'Cloning…' : 'Clone page';
        buttonSubtitle.textContent = running ? 'Do not close this tab' : 'Generate offline ZIP package';
    }

    function setMode(mode, persist = true) {
        const flow = mode === 'flow';
        snapshotModeBtn.classList.toggle('selected', !flow);
        flowModeBtn.classList.toggle('selected', flow);
        snapshotModeBtn.setAttribute('aria-pressed', String(!flow));
        flowModeBtn.setAttribute('aria-pressed', String(flow));
        snapshotPanel.classList.toggle('hidden', flow);
        cloneBtn.classList.toggle('hidden', flow);
        flowPanel.classList.toggle('hidden', !flow);
        if (persist) chrome.storage.local.set({ catClonerPopupMode: mode }).catch(() => {});
    }

    async function send(message) {
        return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, response => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (!response?.success) reject(new Error(response?.error || 'The engine did not respond.'));
            else resolve(response);
        }));
    }

    async function runFlowAction(button, action, successText, extra = {}) {
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Aguarde…';
        try {
            await send({ action, ...extra });
            await refreshFlow();
            button.textContent = successText;
            setTimeout(() => { button.textContent = original; }, 1200);
        } catch (error) {
            alert(`Visual flow error: ${error.message}`);
            button.textContent = original;
        } finally { button.disabled = false; }
    }

    async function refreshFlow() {
        try {
            const response = await send({ action: 'flowStatus' });
            const steps = response.steps || [];
            flowRecorderState.textContent = response.recording ? '● Recording' : 'Stopped';
            flowRecorderState.classList.toggle('recording', Boolean(response.recording));
            flowSteps.innerHTML = steps.length
                ? steps.sort((a, b) => a.order - b.order).map(step => `<div class="flow-step"><b>${step.order}</b><span title="${escapeHtml(step.title)}">${escapeHtml(step.title || 'Untitled step')}</span><button type="button" data-delete-step="${step.id}" title="Delete step">×</button></div>`).join('')
                : '<p>No steps captured.</p>';
            flowFinishBtn.disabled = steps.length === 0;
        } catch (error) {
            flowSteps.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
        }
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
    }

    function resetUI() {
        setRunning(false);
        statusBox.classList.remove('captcha');
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        cancelCloneBtn.disabled = false;
        cancelCloneBtn.textContent = 'Cancel';
    }

    function clampNumber(value, min, max, fallback) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    }
});
