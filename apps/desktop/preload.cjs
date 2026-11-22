const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fayzDesktop', { request: input => ipcRenderer.invoke('api-request', input) });
