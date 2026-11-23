const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fayzDesktop', {
  request: input => ipcRenderer.invoke('api-request', input),
  notify: input => ipcRenderer.send('notify', { title: String(input?.title || ''), body: String(input?.body || ''), orderId: Number.isSafeInteger(input?.orderId) ? input.orderId : undefined }),
  saveSession: token => ipcRenderer.invoke('session-save', token),
  loadSession: () => ipcRenderer.invoke('session-load'),
  clearSession: () => ipcRenderer.invoke('session-clear'),
  onOpenOrder: callback => { ipcRenderer.removeAllListeners('open-order'); ipcRenderer.on('open-order', (_event, id) => callback(id)); },
});
