const { app, BrowserWindow, ipcMain, screen, dialog, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let automationProcess = null;

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

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(dest);
        const worksheet = workbook.worksheets[0];

        const records = [];
        const colCount = worksheet.columnCount;
        const rowCount = worksheet.rowCount;

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

ipcMain.handle('start-automation', (_event, config) => {
    if (automationProcess) return { error: 'Already running' };

    // Run as a standalone headless Playwright process — no CDP, no embedded browser
    // Clear any stale stop flag from a previous run
    try { fs.unlinkSync(path.join(__dirname, '../.stop-requested')); } catch (_) {}

    const env = { ...process.env, PLAYWRIGHT_HEADLESS: 'true' };
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
            if (line.startsWith('NETWORK_DOWN:')) {
                const reason = line.slice(13).trim();
                if (automationProcess) {
                    try { automationProcess.kill('SIGTERM'); } catch (_) {}
                    automationProcess = null;
                }
                mainWindow.webContents.send('network-down', { reason });
            } else if (line.startsWith('VEHICLE_RESULT:')) {
                try {
                    const record = JSON.parse(line.slice(15));
                    mainWindow.webContents.send('vehicle-result', record);
                } catch (_) {}
            } else if (line.trim() && !line.startsWith('TAB_OPEN:') && !line.startsWith('TAB_DONE:')) {
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
        // Write a flag file so the automation stops cleanly after the current group
        try { fs.writeFileSync(path.join(__dirname, '../.stop-requested'), ''); } catch (_) {}
        // Force-kill fallback after 3 minutes in case the group hangs
        setTimeout(() => {
            if (automationProcess) {
                try { automationProcess.kill('SIGTERM'); } catch (_) {}
                automationProcess = null;
            }
        }, 180000);
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

        const columnMap = new Map();
        for (const r of records) {
            if (!columnMap.has(r.column)) columnMap.set(r.column, []);
            columnMap.get(r.column).push(r);
        }
        const columns = [...columnMap.keys()].sort();

        const headerRow = sheet.getRow(1);
        columns.forEach((col, ci) => {
            const cell = headerRow.getCell(ci + 1);
            cell.value = `Column ${col}`;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.alignment = { horizontal: 'center' };
        });
        headerRow.commit();

        const STATUS_COLOR = {
            success: 'FF22C55E', // green
            skipped: 'FFFBBF24', // amber
            failed:  'FFEF4444', // red
        };

        const maxRows = Math.max(...columns.map(c => columnMap.get(c).length));
        for (let row = 0; row < maxRows; row++) {
            const sheetRow = sheet.getRow(row + 2);
            columns.forEach((col, ci) => {
                const recs = columnMap.get(col);
                if (row < recs.length) {
                    const rec  = recs[row];
                    const cell = sheetRow.getCell(ci + 1);
                    cell.value = rec.vehicle;
                    const color = STATUS_COLOR[rec.status];
                    if (color) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
                        cell.font = { color: { argb: 'FF000000' } };
                    }
                }
            });
            sheetRow.commit();
        }

        columns.forEach((_col, ci) => { sheet.getColumn(ci + 1).width = 18; });

        // Legend sheet
        const legend = workbook.addWorksheet('Legend');
        [
            { label: 'Tagged',        color: 'FF22C55E' },
            { label: 'Already Tagged', color: 'FFFBBF24' },
            { label: 'Failed',         color: 'FFEF4444' },
        ].forEach(({ label: lbl, color }, i) => {
            const row = legend.getRow(i + 1);
            const swatch = row.getCell(1);
            swatch.value = '';
            swatch.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
            row.getCell(2).value = lbl;
            row.commit();
        });
        legend.getColumn(1).width = 6;
        legend.getColumn(2).width = 18;

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

ipcMain.handle('write-retry-sheet', async (_event, { records }) => {
    try {
        const dest = path.join(__dirname, '../src/AutoTagSheet.xlsx');

        // Group by original column letter
        const columnMap = new Map();
        for (const r of records) {
            if (!columnMap.has(r.column)) columnMap.set(r.column, []);
            columnMap.get(r.column).push(r.vehicle);
        }
        const columns = [...columnMap.keys()].sort();

        function colIndex(letter) {
            let n = 0;
            for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
            return n;
        }

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Vehicles');

        columns.forEach((col, ci) => {
            const cell = sheet.getRow(1).getCell(ci + 1);
            cell.value = `Column ${col}`;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.alignment = { horizontal: 'center' };
        });
        sheet.getRow(1).commit();

        columns.forEach((col, ci) => {
            const vehicles = columnMap.get(col);
            vehicles.forEach((v, ri) => {
                sheet.getRow(ri + 2).getCell(ci + 1).value = v;
                sheet.getRow(ri + 2).commit();
            });
            sheet.getColumn(ci + 1).width = 18;
        });

        await workbook.xlsx.writeFile(dest);

        // Return records in the same shape as upload-sheet
        const retryRecords = [];
        columns.forEach((col, ci) => {
            columnMap.get(col).forEach((v, ri) => {
                retryRecords.push({ column: col, vehicle: v, row: ri + 2, status: 'pending', error: null });
            });
        });

        return { ok: true, records: retryRecords };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('download-template', async () => {
    try {
        const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Template',
            defaultPath: 'AutoTagSheet_Template.xlsx',
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
        });
        if (canceled || !filePath) return { ok: false, reason: 'canceled' };

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Vehicles');

        // Two sample columns matching expected sheet structure
        const columns = ['A', 'B'];
        columns.forEach((col, ci) => {
            const headerCell = sheet.getRow(1).getCell(ci + 1);
            headerCell.value = `Column ${col}`;
            headerCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            headerCell.alignment = { horizontal: 'center' };
        });
        sheet.getRow(1).commit();

        // Sample vehicle numbers in rows 2–4
        const samples = [
            ['MH12AB1234', 'DL01CD5678'],
            ['KA03EF9012', 'TN07GH3456'],
            ['GJ05IJ7890', ''],
        ];
        samples.forEach((rowVals, ri) => {
            const sheetRow = sheet.getRow(ri + 2);
            rowVals.forEach((val, ci) => { sheetRow.getCell(ci + 1).value = val; });
            sheetRow.commit();
        });

        columns.forEach((_col, ci) => { sheet.getColumn(ci + 1).width = 18; });

        await workbook.xlsx.writeFile(filePath);
        return { ok: true, filePath };
    } catch (err) {
        return { ok: false, reason: err.message };
    }
});
