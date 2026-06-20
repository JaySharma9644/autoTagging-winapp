const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    downloadRecords:   (payload) => ipcRenderer.invoke('download-records', payload),
    selectFile:             () => ipcRenderer.invoke('select-file'),
    uploadSheet:            p  => ipcRenderer.invoke('upload-sheet', p),
    readEnv:                () => ipcRenderer.invoke('read-env'),
    saveEnv:               env => ipcRenderer.invoke('save-env', env),
    startAutomation:    config => ipcRenderer.invoke('start-automation', config),
    stopAutomation:         () => ipcRenderer.invoke('stop-automation'),
    isRunning:              () => ipcRenderer.invoke('is-running'),
    getScreenSize:          () => ipcRenderer.invoke('get-screen-size'),

    // Embedded browser panel
    setAutomationViewBounds: b  => ipcRenderer.invoke('set-automation-view-bounds', b),
    hideAutomationView:      () => ipcRenderer.invoke('hide-automation-view'),
    switchAutomationTab:     col => ipcRenderer.invoke('switch-automation-tab', col),

    // Events from main → renderer
    onTabOpened:          cb => ipcRenderer.on('tab-opened',          (_e, col)  => cb(col)),
    onTabClosed:          cb => ipcRenderer.on('tab-closed',          (_e, col)  => cb(col)),
    onAutomationViewUrl:  cb => ipcRenderer.on('automation-view-url', (_e, url)  => cb(url)),
    onVehicleResult:      cb => ipcRenderer.on('vehicle-result',      (_e, rec)  => cb(rec)),
    onLogLine:            cb => ipcRenderer.on('log-line',            (_e, data) => cb(data)),
    onDone:               cb => ipcRenderer.on('automation-done',     (_e, data) => cb(data)),
    offLogLine:           () => ipcRenderer.removeAllListeners('log-line'),
    offDone:              () => ipcRenderer.removeAllListeners('automation-done'),
});
