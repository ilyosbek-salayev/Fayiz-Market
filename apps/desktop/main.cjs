const { app, BrowserWindow, shell, ipcMain, Notification, safeStorage, session } = require('electron');
const path = require('node:path');
const { readFileSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const apiUrl = JSON.parse(readFileSync(path.join(__dirname, 'api-url.json'), 'utf8')).apiUrl;
if (!/^https:\/\//.test(apiUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(apiUrl)) throw new Error('A secure API URL is required');
app.setName('Fayz Market Admin'); // user data folder: …/Fayz Market Admin (not the npm package name)
app.setAppUserModelId('uz.fayzmarket.admin'); // Windows: notifications are attributed to the installed app

let mainWindow = null;
ipcMain.handle('api-request', async (_event, input) => {
  if (!/^\/(admin|courier|categories|settings|products|orders|images|p)(\/|\?|$)/.test(input.path) || input.path.includes('..') || input.path.includes('//')) throw new Error('Invalid API path');
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(input.method)) throw new Error('Invalid method');
  const headers = {};
  if (typeof input.authorization === 'string' && /^Bearer [a-f0-9]{64}$/.test(input.authorization)) headers.Authorization = input.authorization;
  if (typeof input.contentType === 'string' && /^application\/json$|^image\/(jpeg|png|webp)$/.test(input.contentType)) headers['Content-Type'] = input.contentType;
  const body = input.body ? (typeof input.body === 'string' ? input.body : Uint8Array.from(input.body)) : undefined;
  if (body && body.length > 5_100_000) throw new Error('Request too large');
  const response = await fetch(apiUrl + input.path, { method: input.method, headers, body });
  return { status: response.status, data: await response.json() };
});

// OS notification (macOS Notification Center / Windows toast). Clicking it focuses the app and opens the order.
ipcMain.on('notify', (_event, input) => {
  if (!Notification.isSupported() || typeof input?.title !== 'string') return;
  const note = new Notification({ title: input.title.slice(0, 120), body: String(input.body || '').slice(0, 240), silent: false });
  note.on('click', () => {
    if (!mainWindow) createWindow();
    mainWindow.show(); mainWindow.focus();
    if (Number.isSafeInteger(input.orderId)) mainWindow.webContents.send('open-order', input.orderId);
  });
  note.show();
});

// The staff session token is encrypted with the OS keychain (macOS Keychain / Windows DPAPI) — never stored in plain text.
const sessionFile = () => path.join(app.getPath('userData'), 'session.bin');
ipcMain.handle('session-save', (_event, token) => {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !safeStorage.isEncryptionAvailable()) return false;
  writeFileSync(sessionFile(), safeStorage.encryptString(token), { mode: 0o600 }); return true;
});
ipcMain.handle('session-load', () => {
  try { if (!existsSync(sessionFile()) || !safeStorage.isEncryptionAvailable()) return ''; const token = safeStorage.decryptString(readFileSync(sessionFile())); return /^[a-f0-9]{64}$/.test(token) ? token : ''; } catch { return ''; }
});
ipcMain.handle('session-clear', () => { try { rmSync(sessionFile(), { force: true }); } catch { /* already gone */ } });

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1280, height: 820, minWidth: 760, minHeight: 540, title: 'Fayz Market Admin', backgroundColor: '#FAFAF7', icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') } });
  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.on('closed', () => { mainWindow = null; });
}
app.whenReady().then(() => {
  // The page is loaded from file://, which sends no Referer. Google Maps browser keys are restricted by referrer
  // to the API origin, so requests to Google Maps carry that origin (only for maps.googleapis.com / gstatic).
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://maps.googleapis.com/*', 'https://maps.gstatic.com/*'] }, (details, done) => {
    done({ requestHeaders: { ...details.requestHeaders, Referer: apiUrl + '/' } });
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
