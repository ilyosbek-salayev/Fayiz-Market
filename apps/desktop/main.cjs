const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const apiUrl = JSON.parse(readFileSync(path.join(__dirname, 'api-url.json'), 'utf8')).apiUrl;
if (!/^https:\/\//.test(apiUrl) && !/^http:\/\/localhost(:\d+)?$/.test(apiUrl)) throw new Error('A secure API URL is required');

ipcMain.handle('api-request', async (_event, input) => {
  if (!/^\/(admin|categories|settings|products|orders|images|p)(\/|\?|$)/.test(input.path) || input.path.includes('..') || input.path.includes('//')) throw new Error('Invalid API path');
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(input.method)) throw new Error('Invalid method');
  const headers = {};
  if (typeof input.authorization === 'string' && /^Bearer [a-f0-9]{64}$/.test(input.authorization)) headers.Authorization = input.authorization;
  if (typeof input.contentType === 'string' && /^application\/json$|^image\/(jpeg|png|webp)$/.test(input.contentType)) headers['Content-Type'] = input.contentType;
  const body = input.body ? (typeof input.body === 'string' ? input.body : Uint8Array.from(input.body)) : undefined;
  if (body && body.length > 5_100_000) throw new Error('Request too large');
  const response = await fetch(apiUrl + input.path, { method: input.method, headers, body });
  return { status: response.status, data: await response.json() };
});

function createWindow() {
  const window = new BrowserWindow({ width: 1280, height: 800, minWidth: 760, minHeight: 540, title: 'Fayz Market Admin', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') } });
  window.loadFile(path.join(__dirname, 'web', 'index.html'));
  window.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', event => event.preventDefault());
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
