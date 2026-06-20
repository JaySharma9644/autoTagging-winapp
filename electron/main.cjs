const { app, BrowserWindow, WebContentsView, ipcMain, screen, dialog, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

app.commandLine.appendSwitch('remote-debugging-port', '9222');
app.commandLine.appendSwitch('remote-allow-origins', '*');

let mainWindow;
let automationProcess = null;

// Multi-tab automation view management
const automationViews = new Map(); // column → WebContentsView
let activeTabColumn   = null;
let lastViewBounds    = null;      // last bounds reported by renderer

function createAutomationTab(column) {
    if (automationViews.has(column)) return;

    const view = new WebContentsView({
        webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    mainWindow.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); // hidden until selected

    const sentinel = `AUTOMATION_VIEW_${column}`;
    view.webContents.loadURL(
        `data:text/html,<html><head><title>${sentinel}</title></head>` +
        `<body style="margin:0;background:#0f0f1a;color:#64748b;display:flex;` +
        `align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:14px">` +
        `<span>⏳ Initialising Column ${column}…</span></body></html>`
    );

    view.webContents.on('did-navigate', (_e, url) => {
        if (activeTabColumn === column && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('automation-view-url', url);
        }
    });
    view.webContents.on('did-navigate-in-page', (_e, url, isMain) => {
        if (isMain && activeTabColumn === column && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('automation-view-url', url);
        }
    });

    automationViews.set(column, view);

    // Auto-show the first tab that opens
    if (automationViews.size === 1 && lastViewBounds) {
        activeTabColumn = column;
        view.setBounds(lastViewBounds);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tab-opened', column);
    }
}

function cleanupAutomationViews() {
    for (const view of automationViews.values()) {
        try { mainWindow.contentView.removeChildView(view); } catch (_) {}
    }
    automationViews.clear();
    activeTabColumn = null;
}

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        x: 0, y: 0, width, height,
        minWidth: 760,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false,
        },
        title: 'AutoTagging Bot',
        backgroundColor: '#0f0f1a',
        frame: true,
        show: false,
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    mainWindow.setMenuBarVisibility(false);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    });

    const logFile = path.join(__dirname, '../debug-renderer.log');
    fs.writeFileSync(logFile, `=== Renderer log ${new Date().toISOString()} ===\n`);
    mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
        fs.appendFileSync(logFile, `[${['verbose','info','warn','error'][level]||level}] ${sourceId}:${line} — ${message}\n`);
    });
}

app.whenReady().then(() => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        Object.keys(headers).forEach(k => {
            if (k.toLowerCase() === 'x-frame-options') delete headers[k];
        });
        callback({ responseHeaders: headers });
    });
    createWindow();
});

app.on('window-all-closed', () => {
    if (automationProcess) automationProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('get-screen-size', () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    return { width, height };
});

ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('upload-sheet', async (_event, sourcePath) => {
    try {
        const dest = path.join(__dirname, '../src/AutoTagSheet.xlsx');
        fs.copyFileSync(sourcePath, dest);

        // Parse the sheet and return all vehicle records
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(dest);
        const worksheet = workbook.worksheets[0];

        const records = [];
        const colCount = worksheet.columnCount;
        const rowCount = worksheet.rowCount;

        // getColumnLetter inline (avoids ESM import)
        function colLetter(n) {
            let s = '';
            while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
            return s;
        }

        for (let col = 1; col <= colCount; col++) {
            for (let row = 2; row <= rowCount; row++) {
                const val = worksheet.getCell(row, col).value;
                if (val && val.toString().trim()) {
                    records.push({
                        column:  colLetter(col),
                        vehicle: val.toString().trim(),
                        row,
                        status:  'pending',
                        error:   null,
                    });
                }
            }
        }

        return { ok: true, dest, records };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('read-env', () => {
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf-8');
    const env = {};
    content.split('\n').forEach(line => {
        const trimmed = line.replace(/\r$/, '');
        const match = trimmed.match(/^([^=\s][^=]*)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    });
    return env;
});

ipcMain.handle('save-env', (_event, envObj) => {
    const envPath = path.join(__dirname, '../.env');
    const content = Object.entries(envObj).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
    fs.writeFileSync(envPath, content, 'utf-8');
    return true;
});

// Renderer reports where the viewport div is — position the active view there
ipcMain.handle('set-automation-view-bounds', (_event, bounds) => {
    lastViewBounds = {
        x: Math.round(bounds.x), y: Math.round(bounds.y),
        width: Math.round(bounds.width), height: Math.round(bounds.height),
    };
    if (activeTabColumn && automationViews.has(activeTabColumn)) {
        automationViews.get(activeTabColumn).setBounds(lastViewBounds);
    }
});

// Hide all views (when leaving the Automation tab)
ipcMain.handle('hide-automation-view', () => {
    for (const view of automationViews.values()) {
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
});

// Switch which column tab is visible
ipcMain.handle('switch-automation-tab', (_event, column) => {
    for (const [col, view] of automationViews) {
        view.setBounds(col === column && lastViewBounds
            ? lastViewBounds
            : { x: 0, y: 0, width: 0, height: 0 });
    }
    activeTabColumn = column;
    const url = automationViews.get(column)?.webContents.getURL() || '';
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('automation-view-url', url);
    }
});

ipcMain.handle('start-automation', (_event, config) => {
    if (automationProcess) return { error: 'Already running' };

    cleanupAutomationViews();

    const env = { ...process.env, PLAYWRIGHT_CDP_PORT: '9222' };
    if (config && config.excelPath) env.EXCEL_FILE_PATH = config.excelPath;

    const nodeBin = process.execPath;
    automationProcess = spawn(nodeBin, ['index.js'], {
        cwd: path.join(__dirname, '..'),
        env,
        shell: false,
    });

    let stdoutBuf = '';
    automationProcess.stdout.on('data', data => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        stdoutBuf += data.toString();
        let idx;
        while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
            const line = stdoutBuf.slice(0, idx);
            stdoutBuf = stdoutBuf.slice(idx + 1);
            if (line.startsWith('TAB_OPEN:')) {
                createAutomationTab(line.slice(9).trim());
            } else if (line.startsWith('TAB_DONE:')) {
                const col = line.slice(9).trim();
                const view = automationViews.get(col);
                if (view) {
                    try { mainWindow.contentView.removeChildView(view); } catch (_) {}
                    automationViews.delete(col);
                }
                if (activeTabColumn === col) {
                    // Switch to another open tab, or clear if none left
                    const next = automationViews.keys().next().value;
                    activeTabColumn = next || null;
                    if (next && lastViewBounds) {
                        automationViews.get(next).setBounds(lastViewBounds);
                    }
                }
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('tab-closed', col);
                }
            } else if (line.startsWith('VEHICLE_RESULT:')) {
                try {
                    const record = JSON.parse(line.slice(15));
                    mainWindow.webContents.send('vehicle-result', record);
                } catch (_) {}
            } else if (line.trim()) {
                mainWindow.webContents.send('log-line', line + '\n');
            }
        }
    });

    automationProcess.stderr.on('data', data => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('log-line', data.toString());
        }
    });

    automationProcess.on('close', code => {
        automationProcess = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('automation-done', { code });
        }
    });

    return { started: true };
});

ipcMain.handle('stop-automation', () => {
    if (automationProcess) {
        automationProcess.kill('SIGTERM');
        automationProcess = null;
        cleanupAutomationViews();
        return { stopped: true };
    }
    return { stopped: false };
});

ipcMain.handle('download-records', async (_event, { records, label }) => {
    try {
        const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
            title: `Download ${label}`,
            defaultPath: `${label.replace(/\s+/g, '_')}.xlsx`,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
        });
        if (canceled || !filePath) return { ok: false, reason: 'canceled' };

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(label);

        // Group records by column letter, preserving sorted column order
        const columnMap = new Map();
        for (const r of records) {
            if (!columnMap.has(r.column)) columnMap.set(r.column, []);
            columnMap.get(r.column).push(r);
        }
        const columns = [...columnMap.keys()].sort();

        // Header row: one column per group
        const headerRow = sheet.getRow(1);
        columns.forEach((col, ci) => {
            const cell = headerRow.getCell(ci + 1);
            cell.value = `Column ${col}`;
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center' };
        });
        headerRow.commit();

        // Data rows: fill each spreadsheet column with vehicles from that group
        const maxRows = Math.max(...columns.map(c => columnMap.get(c).length));
        for (let row = 0; row < maxRows; row++) {
            const sheetRow = sheet.getRow(row + 2);
            columns.forEach((col, ci) => {
                const recs = columnMap.get(col);
                if (row < recs.length) {
                    sheetRow.getCell(ci + 1).value = recs[row].vehicle;
                }
            });
            sheetRow.commit();
        }

        // Auto-width columns
        columns.forEach((_col, ci) => {
            sheet.getColumn(ci + 1).width = 18;
        });

        await workbook.xlsx.writeFile(filePath);
        return { ok: true, filePath };
    } catch (err) {
        return { ok: false, reason: err.message };
    }
});

ipcMain.handle('get-history', () => {
    const historyDir = path.join(__dirname, '../src/history');
    if (!fs.existsSync(historyDir)) return [];
    return fs.readdirSync(historyDir)
        .filter(f => f.startsWith('report_') && f.endsWith('.txt'))
        .sort().reverse()
        .map(f => ({ name: f, content: fs.readFileSync(path.join(historyDir, f), 'utf-8') }));
});

ipcMain.handle('is-running', () => automationProcess !== null);
