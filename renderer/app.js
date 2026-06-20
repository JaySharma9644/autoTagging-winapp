// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function parseStats(line) {
    const m = line.match(/✓\s*(\d+)\s*tagged.*↷\s*(\d+)\s*skipped.*✗\s*(\d+)\s*failed/);
    if (m) return { success: +m[1], skipped: +m[2], failed: +m[3] };
    return null;
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

function nowTime() {
    return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
    running:    false,
    stats:      { total: 0, success: 0, skipped: 0, failed: 0 },
    excelPath:  '',
    records:    [],
    filter:     'all',
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const statusBadge   = document.getElementById('statusBadge');
const statusText    = document.getElementById('statusText');
const btnStart      = document.getElementById('btnStart');
const btnStop       = document.getElementById('btnStop');
const btnClear      = document.getElementById('btnClear');

// Upload bar
const uploadBar      = document.getElementById('uploadBar');
const uploadFilename = document.getElementById('uploadFilename');
const btnPickSheet   = document.getElementById('btnPickSheet');
const btnUploadSheet = document.getElementById('btnUploadSheet');

// Stats
const statTotal   = document.getElementById('statTotal');
const statSuccess = document.getElementById('statSuccess');
const statSkipped = document.getElementById('statSkipped');
const statFailed  = document.getElementById('statFailed');

// Logs tab
const logBox       = document.getElementById('logBox');
const btnClearLogs = document.getElementById('btnClearLogs');

// Records panel
const recordsPanelTitle = document.getElementById('recordsPanelTitle');
const recordsPanelCount = document.getElementById('recordsPanelCount');
const recordsTableBody  = document.getElementById('recordsTableBody');
const noRecords         = document.getElementById('noRecords');

// Credentials (display only)
const envUserId   = document.getElementById('envUserId');
const envPassword = document.getElementById('envPassword');

// Automation browser panel
const browserPlaceholder = document.getElementById('browserPlaceholder');
const browserUrlLabel    = document.getElementById('browserUrlLabel');
const browserViewport    = document.getElementById('browserViewport');
const browserColTabs     = document.getElementById('browserColTabs');

// ── Stats rendering ───────────────────────────────────────────────────────────

function renderStats() {
    statTotal.textContent   = state.stats.total;
    statSuccess.textContent = state.stats.success;
    statSkipped.textContent = state.stats.skipped;
    statFailed.textContent  = state.stats.failed;
}

// ── Log rendering ─────────────────────────────────────────────────────────────

let logAutoScroll = true;
logBox.addEventListener('scroll', () => {
    logAutoScroll = logBox.scrollTop + logBox.clientHeight >= logBox.scrollHeight - 24;
});

function appendLog(rawText) {
    rawText.split('\n').forEach(raw => {
        const line = raw.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').trim();
        if (!line) return;
        const level = parseLevel(line);
        const msgMatch = line.match(/\[.*?\]\s*(.*)/);
        const msg = msgMatch ? msgMatch[1] : line;
        const div = document.createElement('div');
        div.className = `log-line ${level}`;
        div.innerHTML = `<span class="ts">${nowTime()}</span><span class="msg">${escapeHtml(msg)}</span>`;
        logBox.appendChild(div);
    });
    if (logAutoScroll) logBox.scrollTop = logBox.scrollHeight;
}

btnClearLogs.addEventListener('click', () => { logBox.innerHTML = ''; });

// ── Status badge ──────────────────────────────────────────────────────────────

function setStatus(s) {
    statusBadge.className = `status-badge ${s}`;
    const labels = { idle: 'Idle', running: 'Running', done: 'Done', error: 'Error' };
    statusText.textContent = labels[s] || s;
}

// ── Records panel ─────────────────────────────────────────────────────────────

const FILTER_META = {
    all:     { label: 'All Records'    },
    success: { label: 'Tagged Vehicles' },
    skipped: { label: 'Already Tagged' },
    failed:  { label: 'Failed to Tag'   },
};

function renderRecordsPanel() {
    const filtered = state.filter === 'all'
        ? [...state.records]
        : state.records.filter(r => r.status === state.filter && r.status !== 'pending');

    filtered.sort((a, b) => a.column.localeCompare(b.column) || a.row - b.row);

    recordsPanelTitle.textContent = FILTER_META[state.filter].label;
    recordsPanelCount.textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;

    recordsTableBody.innerHTML = '';

    if (filtered.length === 0) {
        noRecords.style.display = 'block';
        recordsTableBody.closest('table').style.display = 'none';
        return;
    }

    noRecords.style.display = 'none';
    recordsTableBody.closest('table').style.display = '';

    filtered.forEach((r, i) => {
        const statusLabel = r.status === 'success' ? '✓ Tagged'
            : r.status === 'skipped' ? '↷ Already Tagged'
            : r.status === 'failed'  ? '✗ Failed'
            : '⏳ Pending';
        const badgeClass = r.status === 'pending'
            ? 'badge badge-pending'
            : `badge badge-${r.status}`;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${escapeHtml(r.column)}</td>
            <td>${escapeHtml(r.vehicle)}</td>
            <td>${r.row}</td>
            <td><span class="${badgeClass}">${statusLabel}</span></td>
            <td style="color:var(--text-muted)">${r.error ? escapeHtml(r.error) : '—'}</td>
        `;
        recordsTableBody.appendChild(tr);
    });
}

function setFilter(filter) {
    state.filter = filter;

    // Highlight active card
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
    document.querySelector(`.stat-card[data-filter="${filter}"]`)?.classList.add('active-filter');

    renderRecordsPanel();
}

// Stat card click handlers (ignore clicks on the download button)
document.querySelectorAll('.stat-card[data-filter]').forEach(card => {
    card.addEventListener('click', e => {
        if (e.target.closest('.btn-card-dl')) return;
        setFilter(card.dataset.filter);
    });
});

// Download button handlers
document.querySelectorAll('.btn-card-dl[data-dl]').forEach(btn => {
    btn.addEventListener('click', async e => {
        e.stopPropagation();
        const filter = btn.dataset.dl;
        const filtered = filter === 'all'
            ? state.records.filter(r => r.status !== 'pending')
            : state.records.filter(r => r.status === filter);

        if (filtered.length === 0) return;

        const labelMap = { all: 'All Records', success: 'Tagged', skipped: 'Already Tagged', failed: 'Failed' };
        const label = labelMap[filter] || filter;

        btn.textContent = '⏳';
        const result = await window.electronAPI.downloadRecords({ records: filtered, label });
        btn.textContent = result.ok ? '✓' : '⬇';
        setTimeout(() => { btn.textContent = '⬇'; }, 2000);
    });
});

// ── Vehicle result collection ─────────────────────────────────────────────────

window.electronAPI.onVehicleResult(record => {
    // Find the pre-loaded pending record and update it in place
    const existing = state.records.find(
        r => r.column === record.column && r.row === record.row && r.status === 'pending'
    );
    if (existing) {
        existing.status = record.status;
        existing.error  = record.error || null;
    } else {
        state.records.push(record);
    }

    if (record.status === 'success') state.stats.success++;
    else if (record.status === 'skipped') state.stats.skipped++;
    else state.stats.failed++;
    // total stays fixed (set at upload time)
    renderStats();
    renderRecordsPanel();
});

// ── Upload bar ────────────────────────────────────────────────────────────────

let pickedSheetPath = null;

btnPickSheet.addEventListener('click', async () => {
    const p = await window.electronAPI.selectFile();
    if (!p) return;
    pickedSheetPath = p;
    uploadFilename.textContent = p.split(/[\\/]/).pop();
    uploadBar.classList.remove('uploaded');
    document.querySelector('.upload-hint').textContent = 'Ready to upload — click Upload to confirm';
    btnUploadSheet.disabled = false;
    btnStart.disabled = true;
});

btnUploadSheet.addEventListener('click', async () => {
    if (!pickedSheetPath) return;
    btnUploadSheet.disabled = true;
    btnUploadSheet.textContent = '⏳ Uploading…';

    const result = await window.electronAPI.uploadSheet(pickedSheetPath);

    if (result.ok) {
        uploadBar.classList.add('uploaded');
        document.querySelector('.upload-hint').textContent = '✓ Uploaded to project — ready to start';
        btnUploadSheet.textContent = '✓ Uploaded';
        btnStart.disabled = false;

        // Pre-populate table with all vehicles from the sheet
        state.records = result.records || [];
        state.stats   = { total: state.records.length, success: 0, skipped: 0, failed: 0 };
        state.filter  = 'all';
        renderStats();
        document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
        document.querySelector('.stat-card[data-filter="all"]').classList.add('active-filter');
        renderRecordsPanel();
    } else {
        btnUploadSheet.textContent = '⬆ Retry';
        btnUploadSheet.disabled = false;
        document.querySelector('.upload-hint').textContent = `Upload failed: ${result.error}`;
    }
});

// ── Controls ──────────────────────────────────────────────────────────────────

btnStart.addEventListener('click', async () => {
    if (state.running) return;

    // Reset statuses to pending but keep the vehicle list (total stays the same)
    state.records.forEach(r => { r.status = 'pending'; r.error = null; });
    state.stats  = { total: state.records.length, success: 0, skipped: 0, failed: 0 };
    state.filter = 'all';
    renderStats();
    renderRecordsPanel();
    clearColTabs();

    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
    document.querySelector('.stat-card[data-filter="all"]').classList.add('active-filter');

    window.electronAPI.offLogLine();
    window.electronAPI.offDone();

    window.electronAPI.onLogLine(data => {
        appendLog(data);
    });

    window.electronAPI.onDone(({ code }) => {
        setRunning(false);
        setStatus(code === 0 ? 'done' : 'error');
        if (uploadBar.classList.contains('uploaded')) btnStart.disabled = false;
        // Mark column tabs
        const failCols = new Set(state.records.filter(r => r.status !== 'success').map(r => r.column));
        const okCols   = new Set(state.records.filter(r => r.status === 'success').map(r => r.column));
        failCols.forEach(col => markColTabDone(col, false));
        okCols.forEach(col => markColTabDone(col, true));
    });

    const result = await window.electronAPI.startAutomation({ excelPath: state.excelPath || '' });
    if (result && result.error) return;

    setRunning(true);
    setStatus('running');
});

btnStop.addEventListener('click', async () => {
    await window.electronAPI.stopAutomation();
    setRunning(false);
    setStatus('idle');
    clearColTabs();
});

btnClear.addEventListener('click', () => {
    state.records.forEach(r => { r.status = 'pending'; r.error = null; });
    state.stats  = { total: state.records.length, success: 0, skipped: 0, failed: 0 };
    state.filter = 'all';
    renderStats();
    renderRecordsPanel();
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
    if (state.records.length > 0) {
        document.querySelector('.stat-card[data-filter="all"]').classList.add('active-filter');
    }
});

function setRunning(yes) {
    state.running     = yes;
    btnStart.disabled = yes;
    btnStop.disabled  = !yes;
}

// ── Automation browser panel ──────────────────────────────────────────────────

function positionAutomationView() {
    const rect = browserViewport.getBoundingClientRect();
    window.electronAPI.setAutomationViewBounds({
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
    });
    browserPlaceholder.classList.add('hidden');
}

const resizeObserver = new ResizeObserver(() => {
    if (activeTab === 'automation') positionAutomationView();
});
resizeObserver.observe(browserViewport);

window.electronAPI.onAutomationViewUrl(url => { browserUrlLabel.textContent = url; });

// ── Column tabs ───────────────────────────────────────────────────────────────

let activeColTab = null;

function addColTab(column) {
    browserColTabs.classList.remove('hidden');
    browserPlaceholder.classList.add('hidden');

    const btn = document.createElement('button');
    btn.className = 'col-tab';
    btn.dataset.column = column;
    btn.innerHTML = `<span class="tab-dot"></span>Col ${column}`;

    btn.addEventListener('click', () => {
        switchColTab(column);
        window.electronAPI.switchAutomationTab(column);
        if (activeTab === 'automation') positionAutomationView();
    });

    browserColTabs.appendChild(btn);
    if (!activeColTab) switchColTab(column);
}

function switchColTab(column) {
    activeColTab = column;
    browserColTabs.querySelectorAll('.col-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.column === column)
    );
}

function markColTabDone(column, success) {
    const btn = browserColTabs.querySelector(`[data-column="${column}"]`);
    if (btn) btn.classList.add(success ? 'done' : 'failed');
}

function clearColTabs() {
    browserColTabs.innerHTML = '';
    browserColTabs.classList.add('hidden');
    activeColTab = null;
    browserPlaceholder.classList.remove('hidden');
    browserUrlLabel.textContent = 'about:blank';
}

window.electronAPI.onTabOpened(column => {
    addColTab(column);
    if (activeTab === 'automation') {
        window.electronAPI.switchAutomationTab(column);
        positionAutomationView();
    }
});

window.electronAPI.onTabClosed(column => {
    const btn = browserColTabs.querySelector(`[data-column="${column}"]`);
    if (btn) btn.remove();

    const remaining = browserColTabs.querySelectorAll('.col-tab');

    if (remaining.length === 0) {
        // All groups done — hide tab bar and show placeholder
        browserColTabs.classList.add('hidden');
        activeColTab = null;
        browserPlaceholder.classList.remove('hidden');
        browserUrlLabel.textContent = 'about:blank';
    } else if (activeColTab === column) {
        // Closed tab was active — switch to the first remaining tab
        const nextCol = remaining[0].dataset.column;
        switchColTab(nextCol);
        window.electronAPI.switchAutomationTab(nextCol);
        if (activeTab === 'automation') positionAutomationView();
    }
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

let activeTab = 'dashboard';

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
        activeTab = tab;
        if (tab === 'automation') positionAutomationView();
        else window.electronAPI.hideAutomationView();
    });
});

// ── Settings ──────────────────────────────────────────────────────────────────

async function loadSettings() {
    const env = await window.electronAPI.readEnv();
    envUserId.value   = env.PORTAL_USER_ID  || '';
    envPassword.value = env.PORTAL_PASSWORD || '';
    state.excelPath   = env.EXCEL_FILE_PATH || '';
}

// ── Init ──────────────────────────────────────────────────────────────────────

(async () => {
    await loadSettings();
    renderRecordsPanel();

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
