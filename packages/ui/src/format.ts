// Presentation helpers (no business logic). Server timestamps come from SQLite CURRENT_TIMESTAMP,
// which is UTC in the form "YYYY-MM-DD HH:MM:SS"; they are shown in the device's local time.
const months = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getDate()}-${months[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Calendar day ("YYYY-MM-DD") without timezone shifting. */
export function formatDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${Number(match[3])}-${months[Number(match[2]) - 1]}`;
}

/** fetch() rejects with a TypeError when the server cannot be reached ("Failed to fetch"). */
export const NETWORK_MESSAGE = 'Serverga ulanib boʻlmadi. Internet yoki Wi‑Fi aloqasini tekshirib, qayta urinib koʻring.';
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message));
}
export function friendlyError(error: unknown): string {
  if (isNetworkFailure(error)) return NETWORK_MESSAGE;
  return error instanceof Error ? error.message : String(error);
}

type NativeShell = { share?: (text: string) => void; isDebug?: () => boolean; openApiSettings?: () => void; reload?: () => void; setSystemBars?: (color: string, light: boolean) => void };
const native = () => (window as unknown as { FayzNative?: NativeShell }).FayzNative;
/** Technical controls (API address, reload) are only exposed inside debug Android builds. */
export function nativeDebug(): boolean { try { return !!native()?.isDebug?.(); } catch { return false; } }
export function openApiSettings() { try { native()?.openApiSettings?.(); } catch { /* shell without the bridge method */ } }
export function nativeReload() { try { if (native()?.reload) native()!.reload!(); else location.reload(); } catch { location.reload(); } }
export function paintSystemBars() {
  const css = getComputedStyle(document.documentElement);
  const color = css.getPropertyValue('--bg').trim() || '#FAFAF7';
  const light = css.getPropertyValue('color-scheme').trim() !== 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  try { native()?.setSystemBars?.(color, light); } catch { /* older shell */ }
}
