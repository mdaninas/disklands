const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ruang', {
  getInitialState: () => ipcRenderer.invoke('initial-state'),
  setLanguage: language => ipcRenderer.invoke('set-language', language),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  scan: root => ipcRenderer.invoke('scan', root),
  cancel: () => ipcRenderer.invoke('cancel-scan'),
  getFolder: folder => ipcRenderer.invoke('get-folder', folder),
  reveal: target => ipcRenderer.invoke('reveal', target),
  copyPath: target => ipcRenderer.invoke('copy-path', target),
  exportCsv: () => ipcRenderer.invoke('export-csv'),
  windowAction: action => ipcRenderer.send('window-action', action),
  onScanEvent: callback => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('scan-event', handler);
    return () => ipcRenderer.removeListener('scan-event', handler);
  }
});
