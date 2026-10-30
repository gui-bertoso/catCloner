document.addEventListener('DOMContentLoaded', async () => {
    const $ = id => document.getElementById(id);
    const titleDisplay = $('pageTitleDisplay');
    const urlDisplay = $('pageUrlDisplay');
    const cloneBtn = $('cloneBtn');
    const buttonTitle = cloneBtn.querySelector('.button-copy strong');
    const buttonSubtitle = cloneBtn.querySelector('.button-copy small');
    const statusBox = $('statusMessage');
    const statusText = $('statusText');
    const statusHint = $('statusHint');
    const progressBar = $('progressBar');
    const progressTrack = $('progressTrack');
    const progressPercent = $('progressPercent');
    const pageLimitInput = $('pageLimit');
    const maxDepthInput = $('maxDepth');
    const snapshotModeBtn = $('snapshotModeBtn');
    const flowModeBtn = $('flowModeBtn');
    const snapshotPanel = $('snapshotPanel');
    const flowPanel = $('flowPanel');
    const flowSteps = $('flowSteps');
    const flowStartBtn = $('flowStartBtn');
    const flowCaptureBtn = $('flowCaptureBtn');
    const flowFinishBtn = $('flowFinishBtn');
    const flowRecorderState = $('flowRecorderState');
    const flowResetBtn = $('flowResetBtn');
    const cancelCloneBtn = $('cancelCloneBtn');
    const feedback = $('feedback');
    let currentTab = null;
    let hasWebPage = false;
    let flowBusy = false;
    let flowRecording = false;
    let flowReady = false;
    let flowCount = 0;

    $('version').textContent = chrome.runtime.getManifest().version;
    try {
        [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        hasWebPage = /^https?:\/\//i.test(currentTab?.url || '');
        titleDisplay.textContent = currentTab?.title || 'No page selected';
        titleDisplay.title = currentTab?.title || '';
        urlDisplay.textContent = currentTab?.url || 'Open a web page to begin';
        urlDisplay.title = currentTab?.url || '';
    } catch (_) {
        titleDisplay.textContent = 'Could not read the active tab';
    }
    if (!hasWebPage) {
        $('pageNotice').textContent = 'Open an HTTP or HTTPS page to start a capture.';
        $('pageNotice').classList.remove('hidden');
    }
    cloneBtn.disabled = !hasWebPage;
    updateFlowControls();

    let initialMode = 'snapshot';
    try {
        // Keep the existing storage key so an update preserves the selected mode.
        const saved = await chrome.storage.local.get('catClonerPopupMode');
        initialMode = saved.catClonerPopupMode === 'flow' ? 'flow' : 'snapshot';
    } catch (_) { /* The default mode remains usable if storage is unavailable. */ }
    setMode(initialMode, false);
    if (initialMode === 'flow') await refreshFlow().catch(() => {});

    snapshotModeBtn.addEventListener('click', () => setMode('snapshot'));
    flowModeBtn.addEventListener('click', async () => {
        setMode('flow');
        await refreshFlow().catch(() => {});
    });
    flowStartBtn.addEventListener('click', async () => {
        if (!hasWebPage) return;
        if (flowCount && !confirm('Start a new recording? This clears the saved steps.')) return;
        await runFlowAction('flowStart', 'Recording started.', { tabId: currentTab.id });
    });
    flowCaptureBtn.addEventListener('click', async () => {
        if (!hasWebPage) return;
        await runFlowAction('flowCapture', 'Page captured.', { tabId: currentTab.id });
    });
    flowFinishBtn.addEventListener('click', () => runFlowAction('flowFinish', 'ZIP download started.'));
    flowResetBtn.addEventListener('click', async () => {
        if (!confirm('Clear this recording and all saved steps?')) return;
        await runFlowAction('flowReset', 'Recording cleared.');
    });
    flowSteps.addEventListener('click', async event => {
        const button = event.target.closest('[data-delete-step]');
        if (button && !flowBusy) await runFlowAction('flowDelete', 'Step removed.', { stepId: Number(button.dataset.deleteStep) });
    });
    cancelCloneBtn.addEventListener('click', async () => {
        if (!currentTab) return;
        cancelCloneBtn.disabled = true;
        cancelCloneBtn.textContent = 'Canceling…';
        statusText.textContent = 'Canceling capture…';
        try { await send({ action: 'cancelClone', tabId: currentTab.id }); }
        catch (error) { resetUI(); setFeedback(`Could not cancel: ${error.message}`, true); }
    });
    cloneBtn.addEventListener('click', () => {
        if (!hasWebPage) return;
        setFeedback('');
        setRunning(true);
        const options = {
            pageLimit: clampNumber(pageLimitInput.value, 1, 100, 6),
            maxDepth: clampNumber(maxDepthInput.value, 0, 5, 1)
        };
        pageLimitInput.value = options.pageLimit;
        maxDepthInput.value = options.maxDepth;
        chrome.runtime.sendMessage({ action: 'startClone', tabId: currentTab.id, options }, response => {
            const error = chrome.runtime.lastError?.message || (!response?.success && (response?.error || 'The capture did not start.'));
            if (error) { resetUI(); setFeedback(error, true); }
        });
    });
    chrome.runtime.onMessage.addListener(request => {
        if (request.action === 'updateStatus') {
            const progress = Math.max(0, Math.min(100, Number(request.progress) || 0));
            setRunning(true);
            const captcha = /captcha/i.test(request.text || '');
            statusText.textContent = request.text || 'Capturing page…';
            progressBar.style.width = `${progress}%`;
            progressTrack.setAttribute('aria-valuenow', String(Math.round(progress)));
            progressPercent.textContent = `${Math.round(progress)}%`;
            statusBox.classList.toggle('captcha', captcha);
            statusHint.textContent = captcha
                ? 'Complete verification in the page to continue.'
                : 'Keep the page open until the download starts.';
            if (progress === 100) { resetUI(); setFeedback('ZIP download started.'); }
        } else if (request.action === 'cloneFailed') {
            resetUI();
            setFeedback(request.error || 'Capture failed. Try again.', true);
        } else if (request.action === 'cloneCancelled') {
            resetUI();
            setFeedback('Capture canceled.');
        } else if (request.action === 'flowStepCaptured') {
            refreshFlow().catch(() => {});
        }
    });

    function setRunning(running) {
        cloneBtn.disabled = running || !hasWebPage;
        snapshotModeBtn.disabled = running;
        flowModeBtn.disabled = running;
        pageLimitInput.disabled = running;
        maxDepthInput.disabled = running;
        statusBox.classList.toggle('hidden', !running);
        cloneBtn.setAttribute('aria-busy', String(running));
        buttonTitle.textContent = running ? 'Capturing…' : 'Save snapshot';
        buttonSubtitle.textContent = running ? 'Please wait' : 'Download ZIP';
    }
    function setMode(mode, persist = true) {
        const flow = mode === 'flow';
        snapshotModeBtn.classList.toggle('selected', !flow);
        flowModeBtn.classList.toggle('selected', flow);
        snapshotModeBtn.setAttribute('aria-pressed', String(!flow));
        flowModeBtn.setAttribute('aria-pressed', String(flow));
        snapshotPanel.classList.toggle('hidden', flow);
        flowPanel.classList.toggle('hidden', !flow);
        setFeedback('');
        if (persist) chrome.storage.local.set({ catClonerPopupMode: mode }).catch(() => {});
    }
    async function send(message) {
        return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, response => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (!response?.success) reject(new Error(response?.error || 'The extension did not respond.'));
            else resolve(response);
        }));
    }
    async function runFlowAction(action, successText, extra = {}) {
        if (flowBusy) return;
        flowBusy = true;
        updateFlowControls();
        setFeedback('Working…');
        try {
            await send({ action, ...extra });
            await refreshFlow();
            setFeedback(successText);
        } catch (error) {
            setFeedback(error.message, true);
        } finally {
            flowBusy = false;
            updateFlowControls();
        }
    }
    async function refreshFlow() {
        try {
            const response = await send({ action: 'flowStatus' });
            const steps = response.steps || [];
            flowReady = true;
            flowRecording = Boolean(response.recording);
            flowCount = steps.length;
            $('stepCount').textContent = String(flowCount);
            flowRecorderState.textContent = flowRecording ? 'Recording' : 'Not recording';
            flowRecorderState.classList.toggle('recording', flowRecording);
            flowSteps.innerHTML = steps.length
                ? steps.sort((a, b) => a.order - b.order).map(step => `<div class="flow-step"><b>${step.order}</b><span title="${escapeHtml(step.title)}">${escapeHtml(step.title || 'Untitled step')}</span><button type="button" data-delete-step="${step.id}" aria-label="Delete step ${step.order}: ${escapeHtml(step.title || 'Untitled step')}">×</button></div>`).join('')
                : '<p class="empty">Your recorded pages will appear here.</p>';
        } catch (error) {
            flowReady = false;
            setFeedback(`Could not load the recording: ${error.message}`, true);
            throw error;
        } finally { updateFlowControls(); }
    }
    function updateFlowControls() {
        const unavailable = flowBusy || !flowReady;
        flowStartBtn.disabled = unavailable || flowRecording || !hasWebPage;
        flowCaptureBtn.disabled = unavailable || !flowRecording || !hasWebPage;
        flowFinishBtn.disabled = unavailable || flowCount === 0;
        flowResetBtn.disabled = unavailable || (!flowRecording && flowCount === 0);
        flowPanel.setAttribute('aria-busy', String(flowBusy));
        flowSteps.querySelectorAll('button').forEach(button => { button.disabled = unavailable; });
    }
    function setFeedback(message, error = false) {
        feedback.textContent = message;
        feedback.classList.toggle('hidden', !message);
        feedback.classList.toggle('error', error);
    }
    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
    }
    function resetUI() {
        setRunning(false);
        statusBox.classList.remove('captcha');
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        progressTrack.setAttribute('aria-valuenow', '0');
        cancelCloneBtn.disabled = false;
        cancelCloneBtn.textContent = 'Cancel';
    }
    function clampNumber(value, min, max, fallback) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
    }
});
