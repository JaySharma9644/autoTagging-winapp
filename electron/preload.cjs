const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFile: () => ipcRenderer.invoke('select-file'),
    readEnv: () => ipcRenderer.invoke('read-env'),
    saveEnv: env => ipcRenderer.invoke('save-env', env),
    startAutomation: config => ipcRenderer.invoke('start-automation', config),
    stopAutomation: () => ipcRenderer.invoke('stop-automation'),
    getHistory: () => ipcRenderer.invoke('get-history'),
    isRunning: () => ipcRenderer.invoke('is-running'),
    getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
    onLogLine: callback => ipcRenderer.on('log-line', (_e, data) => callback(data)),
    onDone: callback => ipcRenderer.on('automation-done', (_e, data) => callback(data)),
    offLogLine: () => ipcRenderer.removeAllListeners('log-line'),
    offDone: () => ipcRenderer.removeAllListeners('automation-done'),
});
