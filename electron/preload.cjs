const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    downloadRecords:   payload => ipcRenderer.invoke('download-records', payload),
    downloadTemplate:       () => ipcRenderer.invoke('download-template'),
    writeRetrySheet:   payload => ipcRenderer.invoke('write-retry-sheet', payload),
    selectFile:           () => ipcRenderer.invoke('select-file'),
    uploadSheet:          p  => ipcRenderer.invoke('upload-sheet', p),
    readEnv:              () => ipcRenderer.invoke('read-env'),
    saveEnv:             env => ipcRenderer.invoke('save-env', env),
    startAutomation:  config => ipcRenderer.invoke('start-automation', config),
    stopAutomation:       () => ipcRenderer.invoke('stop-automation'),
    isRunning:            () => ipcRenderer.invoke('is-running'),
    getScreenSize:        () => ipcRenderer.invoke('get-screen-size'),

    // Events from main → renderer
    onVehicleResult: cb => ipcRenderer.on('vehicle-result',   (_e, rec)  => cb(rec)),
    onLogLine:       cb => ipcRenderer.on('log-line',         (_e, data) => cb(data)),
    onDone:          cb => ipcRenderer.on('automation-done',  (_e, data) => cb(data)),
    onNetworkDown:   cb => ipcRenderer.on('network-down',     (_e, data) => cb(data)),
    offLogLine:      () => ipcRenderer.removeAllListeners('log-line'),
    offDone:         () => ipcRenderer.removeAllListeners('automation-done'),
});
