const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openDataDir: () => ipcRenderer.invoke('open-data-dir'),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
});
