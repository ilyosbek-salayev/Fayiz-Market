// Telegram Login (official widget / oauth.telegram.org redirect) verification.
// https://core.telegram.org/widgets/login#checking-authorization
// data_check_string = all received fields except `hash`, sorted, "key=value" joined with "\n";
// secret_key = SHA256(bot_token); valid when hex(HMAC_SHA256(secret_key, data_check_string)) === hash.
export type TelegramAuth = { id: string; first_name?: string; last_name?: string; username?: string; photo_url?: string; auth_date: string; hash: string };

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
const ALLOWED = new Set(['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']);

export function dataCheckString(data: Record<string, string>): string {
  return Object.keys(data).filter(k => k !== 'hash' && data[k] !== undefined && data[k] !== null).sort().map(k => `${k}=${data[k]}`).join('\n');
}

export async function telegramSignature(data: Record<string, string>, botToken: string): Promise<string> {
  const secret = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dataCheckString(data))));
}

export type TelegramCheck = { ok: true; user: TelegramAuth } | { ok: false; reason: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' | 'FUTURE' };

/** Verifies signature and freshness. `maxAgeSeconds` bounds replay of a captured payload. */
export async function verifyTelegramLogin(raw: unknown, botToken: string, nowSeconds = Math.floor(Date.now() / 1000), maxAgeSeconds = 600): Promise<TelegramCheck> {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'MALFORMED' };
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED.has(k)) continue; // unknown fields are not part of Telegram's payload
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' && typeof v !== 'number') return { ok: false, reason: 'MALFORMED' };
    data[k] = String(v);
  }
  if (!/^\d{1,20}$/.test(data.id || '') || !/^\d{1,12}$/.test(data.auth_date || '') || !/^[a-f0-9]{64}$/.test(data.hash || '')) return { ok: false, reason: 'MALFORMED' };
  const expected = await telegramSignature(data, botToken);
  let diff = 0; for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ data.hash.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: 'BAD_SIGNATURE' };
  const age = nowSeconds - Number(data.auth_date);
  if (age > maxAgeSeconds) return { ok: false, reason: 'EXPIRED' };
  if (age < -60) return { ok: false, reason: 'FUTURE' };
  return { ok: true, user: data as unknown as TelegramAuth };
}

/** The bot id is the numeric prefix of the bot token ("123456:ABC…"); it is public. */
export const botIdFromToken = (token: string) => token.split(':')[0];
