// ── Helpers ───────────────────────────────────────────────────────────────────

function stripAnsi(str) {
    return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '');
}

function parseLevel(line) {
    if (line.includes('✅') || line.includes('SUCCESS')) return 'success';
    if (line.includes('❌') || line.includes('ERROR'))   return 'error';
    if (line.includes('⚠️') || line.includes('WARNING')) return 'warning';
    if (line.includes('👉') || line.includes('STEP'))    return 'step';
    if (line.includes('🐛') || line.includes('DEBUG'))   return 'debug';
    if (line.includes('ℹ️') || line.includes('INFO'))    return 'info';
    return 'raw';
}

function parseStats(line) {
    // Match "BATCH END — ✓ N tagged  ↷ N skipped  ✗ N failed"
    const m = line.match(/✓\s*(\d+)\s*tagged.*↷\s*(\d+)\s*skipped.*✗\s*(\d+)\s*failed/);
    if (m) return { success: +m[1], skipped: +m[2], failed: +m[3] };
    return null;
}

function now() {
    return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
    running: false,
    stats: { total: 0, success: 0, skipped: 0, failed: 0 },
    excelPath: '',
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const logBox        = document.getElementById('logBox');
const statusBadge   = document.getElementById('statusBadge');
const statusText    = document.getElementById('statusText');
const btnStart      = document.getElementById('btnStart');
const btnStop       = document.getElementById('btnStop');
const btnClear      = document.getElementById('btnClear');
const statTotal     = document.getElementById('statTotal');
const statSuccess   = document.getElementById('statSuccess');
const statSkipped   = document.getElementById('statSkipped');
const statFailed    = document.getElementById('statFailed');

// Settings
const envUserId     = document.getElementById('envUserId');
const envPassword   = document.getElementById('envPassword');
const envPortalUrl  = document.getElementById('envPortalUrl');
const envGeminiKey  = document.getElementById('envGeminiKey');
const excelPathInput= document.getElementById('excelPath');
const btnBrowse     = document.getElementById('btnBrowse');
const btnReset      = document.getElementById('btnReset');
const btnSave       = document.getElementById('btnSave');
const saveStatus    = document.getElementById('saveStatus');

// History
const historyList   = document.getElementById('historyList');
const historyContent= document.getElementById('historyContent');

// ── Log rendering ─────────────────────────────────────────────────────────────

let autoScroll = true;

logBox.addEventListener('scroll', () => {
    autoScroll = logBox.scrollTop + logBox.clientHeight >= logBox.scrollHeight - 20;
});

function appendLog(rawText) {
    const lines = rawText.split('\n');
    const frag = document.createDocumentFragment();

    lines.forEach(raw => {
        const line = stripAnsi(raw).trim();
        if (!line) return;

        const level = parseLevel(line);

        // Extract message after the timestamp bracket
        const msgMatch = line.match(/\[.*?\]\s*(.*)/);
        const msg = msgMatch ? msgMatch[1] : line;

        const div = document.createElement('div');
        div.className = `log-line ${level}`;
        div.innerHTML = `<span class="ts">${now()}</span><span class="msg">${escapeHtml(msg)}</span>`;
        frag.appendChild(div);

        // Check for stats
        const stats = parseStats(line);
        if (stats) {
            state.stats.success += stats.success;
            state.stats.skipped += stats.skipped;
            state.stats.failed  += stats.failed;
            state.stats.total = state.stats.success + state.stats.skipped + state.stats.failed;
            renderStats();
        }
    });

    logBox.appendChild(frag);
    if (autoScroll) logBox.scrollTop = logBox.scrollHeight;
}

function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderStats() {
    statTotal.textContent   = state.stats.total;
    statSuccess.textContent = state.stats.success;
    statSkipped.textContent = state.stats.skipped;
    statFailed.textContent  = state.stats.failed;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function setStatus(s) {
    statusBadge.className = `status-badge ${s}`;
    const labels = { idle: 'Idle', running: 'Running', done: 'Done', error: 'Error' };
    statusText.textContent = labels[s] || s;
}

// ── Controls ──────────────────────────────────────────────────────────────────

btnStart.addEventListener('click', async () => {
    if (state.running) return;

    // Reset stats
    state.stats = { total: 0, success: 0, skipped: 0, failed: 0 };
    renderStats();

    window.electronAPI.offLogLine();
    window.electronAPI.offDone();

    window.electronAPI.onLogLine(data => appendLog(data));
    window.electronAPI.onDone(({ code }) => {
        setRunning(false);
        setStatus(code === 0 ? 'done' : 'error');
        appendLog(`\n[AutoTagging Bot] Process exited with code ${code}\n`);
    });

    const config = { excelPath: state.excelPath || '' };
    const result = await window.electronAPI.startAutomation(config);

    if (result && result.error) {
        appendLog(`\n[Error] ${result.error}\n`);
        return;
    }

    setRunning(true);
    setStatus('running');
    appendLog(`[AutoTagging Bot] Automation started — browser will open on the right side of your screen\n`);
});

btnStop.addEventListener('click', async () => {
    await window.electronAPI.stopAutomation();
    setRunning(false);
    setStatus('idle');
    appendLog(`\n[AutoTagging Bot] Stopped by user\n`);
});

btnClear.addEventListener('click', () => {
    logBox.innerHTML = '';
    state.stats = { total: 0, success: 0, skipped: 0, failed: 0 };
    renderStats();
});

function setRunning(yes) {
    state.running = yes;
    btnStart.disabled = yes;
    btnStop.disabled  = !yes;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
        if (tab === 'history') loadHistory();
    });
});

// ── Settings ──────────────────────────────────────────────────────────────────

async function loadSettings() {
    const env = await window.electronAPI.readEnv();
    envUserId.value    = env.PORTAL_USER_ID  || '';
    envPassword.value  = env.PORTAL_PASSWORD || '';
    envPortalUrl.value = env.PORTAL_URL      || '';
    envGeminiKey.value = env.GEMINI_API_KEY  || '';
    excelPathInput.value = env.EXCEL_FILE_PATH || '';
    state.excelPath = excelPathInput.value;
}

btnBrowse.addEventListener('click', async () => {
    const p = await window.electronAPI.selectFile();
    if (p) {
        excelPathInput.value = p;
        state.excelPath = p;
    }
});

btnReset.addEventListener('click', () => {
    excelPathInput.value = '';
    state.excelPath = '';
});

btnSave.addEventListener('click', async () => {
    const env = {
        PORTAL_USER_ID:  envUserId.value.trim(),
        PORTAL_PASSWORD: envPassword.value.trim(),
        PORTAL_URL:      envPortalUrl.value.trim(),
        GEMINI_API_KEY:  envGeminiKey.value.trim(),
    };
    if (excelPathInput.value.trim()) {
        env.EXCEL_FILE_PATH = excelPathInput.value.trim();
    }
    state.excelPath = excelPathInput.value.trim();
    await window.electronAPI.saveEnv(env);
    saveStatus.style.display = 'block';
    setTimeout(() => { saveStatus.style.display = 'none'; }, 2500);
});

// ── History ───────────────────────────────────────────────────────────────────

async function loadHistory() {
    const reports = await window.electronAPI.getHistory();
    historyList.innerHTML = '';

    if (!reports.length) {
        historyList.innerHTML = '<div style="padding:12px;font-size:11px;color:var(--text-muted);">No reports yet</div>';
        return;
    }

    reports.forEach((r, i) => {
        const parts = r.name.replace('report_', '').replace('.txt', '').split('_');
        const dateStr = parts[0] ? `${parts[0].slice(0,4)}-${parts[0].slice(4,6)}-${parts[0].slice(6,8)}` : '';
        const timeStr = parts[1] ? `${parts[1].slice(0,2)}:${parts[1].slice(2,4)}:${parts[1].slice(4,6)}` : '';

        const div = document.createElement('div');
        div.className = `history-item${i === 0 ? ' active' : ''}`;
        div.innerHTML = `<div>Session ${i + 1}</div><div class="hi-date">${dateStr} ${timeStr}</div>`;
        div.addEventListener('click', () => {
            document.querySelectorAll('.history-item').forEach(x => x.classList.remove('active'));
            div.classList.add('active');
            historyContent.textContent = r.content;
        });
        historyList.appendChild(div);

        if (i === 0) historyContent.textContent = r.content;
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────

(async () => {
    await loadSettings();

    const running = await window.electronAPI.isRunning();
    if (running) {
        setRunning(true);
        setStatus('running');
        window.electronAPI.onLogLine(data => appendLog(data));
        window.electronAPI.onDone(({ code }) => {
            setRunning(false);
            setStatus(code === 0 ? 'done' : 'error');
        });
    }
})();
