// Thin wrappers around the Android shell bridge (window.FayzNative) with browser / desktop fallbacks.
// Every call is optional: an older APK without a method simply reports the feature as unavailable.
type Shell = {
  notify?: (id: string, title: string, body: string, orderId: string) => void;
  biometricStatus?: () => string;
  biometricEnable?: (secret: string, callbackId: string) => void;
  biometricUnlock?: (callbackId: string) => void;
  biometricDisable?: () => void;
  biometricStored?: () => boolean;
  keepScreenOn?: (on: boolean) => void;
  openExternal?: (url: string) => void;
};
type Desktop = { notify?: (input: { title: string; body: string; orderId?: number }) => void; saveSession?: (token: string) => Promise<boolean>; loadSession?: () => Promise<string>; clearSession?: () => Promise<void> };
const shell = () => (window as unknown as { FayzNative?: Shell }).FayzNative;
const desktop = () => (window as unknown as { fayzDesktop?: Desktop }).fayzDesktop;

const pending = new Map<string, (result: { ok: boolean; value: string }) => void>();
(window as unknown as { __fayzNative: (id: string, ok: boolean, value: string) => void }).__fayzNative = (id, ok, value) => { pending.get(id)?.({ ok, value }); pending.delete(id); };
function nativeCall(start: (id: string) => void): Promise<{ ok: boolean; value: string }> {
  return new Promise(resolve => { const id = Math.random().toString(36).slice(2); pending.set(id, resolve); try { start(id); } catch { pending.delete(id); resolve({ ok: false, value: 'unsupported' }); } });
}

/** 'available' | 'none' (no fingerprint enrolled) | 'unsupported' (old Android / no hardware / old APK). */
export function biometricStatus(): 'available' | 'none' | 'unsupported' {
  try { const s = shell()?.biometricStatus?.(); return s === 'available' || s === 'none' ? s : 'unsupported'; } catch { return 'unsupported'; }
}
export const biometricStored = (): boolean => { try { return !!shell()?.biometricStored?.(); } catch { return false; } };
/** Encrypts the session token with a Keystore key that needs a fingerprint; the token never leaves the device. */
export const biometricEnable = (token: string) => nativeCall(id => shell()!.biometricEnable!(token, id));
export const biometricUnlock = () => nativeCall(id => shell()!.biometricUnlock!(id));
export const biometricDisable = () => { try { shell()?.biometricDisable?.(); } catch { /* old shell */ } };
export const keepScreenOn = (on: boolean) => { try { shell()?.keepScreenOn?.(on); } catch { /* old shell */ } };
export function openExternal(url: string) {
  try { if (shell()?.openExternal) { shell()!.openExternal!(url); return; } } catch { /* fall through */ }
  window.open(url, '_blank', 'noopener');
}

/** System notification: Android shell → native notification; desktop → OS notification; browser → Notification API. */
export function systemNotify(id: string, title: string, body: string, orderId?: number) {
  try { if (shell()?.notify) { shell()!.notify!(id, title, body, String(orderId ?? '')); return true; } } catch { /* old shell */ }
  try { if (desktop()?.notify) { desktop()!.notify!({ title, body, orderId }); return true; } } catch { /* fall through */ }
  if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body, tag: id }); return true; } catch { /* some WebViews */ } }
  return false;
}
export async function askNotificationPermission() {
  if (shell()?.notify || desktop()?.notify) return true;
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** Desktop app: session persisted with the OS keychain (Electron safeStorage); elsewhere unavailable. */
export const desktopSession = {
  available: () => !!desktop()?.saveSession,
  save: (token: string) => desktop()?.saveSession?.(token) ?? Promise.resolve(false),
  load: () => desktop()?.loadSession?.() ?? Promise.resolve(''),
  clear: () => desktop()?.clearSession?.() ?? Promise.resolve(),
};
