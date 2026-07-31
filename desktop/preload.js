const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openDataDir: () => ipcRenderer.invoke('open-data-dir'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  chooseDataDir: () => ipcRenderer.invoke('choose-data-dir'),
  getExportDir: () => ipcRenderer.invoke('get-export-dir'),
  chooseExportDir: () => ipcRenderer.invoke('choose-export-dir'),
  openExportDir: () => ipcRenderer.invoke('open-export-dir'),
  saveDownload: (url, filename) => ipcRenderer.invoke('save-download', url, filename),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  setFullscreen: (enabled) => ipcRenderer.invoke('window-set-fullscreen', enabled),
  onFullscreenChange: (listener) => {
    const channel = 'window-fullscreen-changed';
    const handler = (_event, enabled) => listener(Boolean(enabled));
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  closeWindow: () => ipcRenderer.invoke('window-close'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
});
