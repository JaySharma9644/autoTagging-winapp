const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let automationProcess = null;

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const halfWidth = Math.floor(width / 2);

    mainWindow = new BrowserWindow({
        x: 0,
        y: 0,
        width: halfWidth,
        height: height,
        minWidth: 520,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
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
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (automationProcess) {
        automationProcess.kill();
    }
    if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────

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

ipcMain.handle('read-env', () => {
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf-8');
    const env = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=\s][^=]*)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    });
    return env;
});

ipcMain.handle('save-env', (_event, envObj) => {
    const envPath = path.join(__dirname, '../.env');
    const content = Object.entries(envObj)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') + '\n';
    fs.writeFileSync(envPath, content, 'utf-8');
    return true;
});

ipcMain.handle('start-automation', (_event, config) => {
    if (automationProcess) return { error: 'Already running' };

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const halfWidth = Math.floor(width / 2);

    const env = {
        ...process.env,
        BROWSER_X: String(halfWidth),
        BROWSER_Y: '0',
        BROWSER_W: String(halfWidth),
        BROWSER_H: String(height),
    };

    if (config && config.excelPath) {
        env.EXCEL_FILE_PATH = config.excelPath;
    }

    const nodeBin = process.execPath;

    automationProcess = spawn(nodeBin, ['index.js'], {
        cwd: path.join(__dirname, '..'),
        env,
        shell: false,
    });

    automationProcess.stdout.on('data', data => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('log-line', data.toString());
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
        return { stopped: true };
    }
    return { stopped: false };
});

ipcMain.handle('get-history', () => {
    const historyDir = path.join(__dirname, '../src/history');
    if (!fs.existsSync(historyDir)) return [];
    return fs.readdirSync(historyDir)
        .filter(f => f.startsWith('report_') && f.endsWith('.txt'))
        .sort()
        .reverse()
        .map(f => ({
            name: f,
            content: fs.readFileSync(path.join(historyDir, f), 'utf-8'),
        }));
});

ipcMain.handle('is-running', () => automationProcess !== null);
