// Shared Worker helpers: bindings, error helpers, hashing, rate limiting and audit logging.
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

export type Bindings = {
  DB: D1Database; IMAGES: R2Bucket; APP_ORIGIN: string; PUBLIC_BASE_URL: string; BOOTSTRAP_SECRET: string;
  /** "production" disables every development-only shortcut (e.g. OTP echo). */
  ENVIRONMENT?: string;
  /** Development only: return OTP codes in the API response instead of sending them. Ignored outside local development. */
  OTP_DEV_ECHO?: string;
  /** Development only: origin of a local mock (http://127.0.0.1:<port>) that stands in for every external provider. */
  DEV_MOCK_PROVIDERS?: string;
  // Optional integration secrets — set with `wrangler secret put <NAME> --env production`, never in Git.
  TELEGRAM_BOT_TOKEN?: string;
  SMS_PROVIDER?: string; ESKIZ_EMAIL?: string; ESKIZ_PASSWORD?: string; ESKIZ_FROM?: string;
  GOOGLE_ROUTES_KEY?: string;
  FCM_SERVICE_ACCOUNT?: string;
  EMAIL_PROVIDER?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string;
  /** OpenRouteService key (free tier) — real road routes for the store map and couriers. */
  ORS_API_KEY?: string;
  /** Payme Merchant API keys (production / sandbox) and Click SHOP API secret. */
  PAYME_KEY?: string; PAYME_TEST_KEY?: string; CLICK_SECRET_KEY?: string;
  /** 32-byte base64 key that seals credentials entered in Admin → Integratsiyalar (AES-256-GCM). Never stored in D1. */
  INTEGRATIONS_MASTER_KEY?: string;
};
export type Role = 'owner' | 'manager' | 'courier';
export type Staff = { id: number; role: Role };
export type Customer = { id: number; phone: string | null; name: string; telegramId: string | null };
export type Variables = { admin: Staff; customer: Customer; baseEnv: Bindings };
export type Env = { Bindings: Bindings; Variables: Variables };
export type App = Hono<Env>;

export const fail = (status: number, code: string, message: string): never => { throw new HTTPException(status as 400, { message: JSON.stringify({ code, message }) }); };
export const parse = async <T extends z.ZodTypeAny>(c: { req: { json: () => Promise<unknown> } }, schema: T): Promise<z.infer<T>> => {
  let body: unknown;
  try { body = await c.req.json(); } catch { fail(400, 'INVALID_JSON', 'Soʻrov tanasi JSON emas'); }
  return schema.parse(body);
};
export const sha256 = async (value: string): Promise<string> => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');
export const idFrom = (raw: string): number => { const id = Number(raw); if (!Number.isSafeInteger(id) || id < 1) fail(400, 'INVALID_ID', 'ID notoʻgʻri'); return id; };
export const isProduction = (env: Bindings) => env.ENVIRONMENT === 'production';
/**
 * Local test mode. Requires BOTH an explicit ENVIRONMENT=development and a plain-http public URL, so a deployed
 * Worker (always https, ENVIRONMENT=production) can never enable OTP echo or mock providers by a stray variable.
 */
export const isDevelopment = (env: Bindings) => {
  try { const url = new URL(env.PUBLIC_BASE_URL); return env.ENVIRONMENT === 'development' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); }
  catch { return false; }
};
export type Provider = 'eskiz' | 'resend' | 'google-oauth' | 'fcm' | 'telegram' | 'routes' | 'ors';
/** Real provider origin, or — in local test mode only — the local mock origin with a provider prefix. */
export function providerBase(env: Bindings, provider: Provider, real: string): string {
  const mock = env.DEV_MOCK_PROVIDERS || '';
  return isDevelopment(env) && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(mock) ? `${mock}/${provider}` : real;
}
export const clientIp = (c: { req: { header: (name: string) => string | undefined } }) => c.req.header('CF-Connecting-IP') || 'local';

/**
 * Fixed-window counter in D1. Returns false when `key` has already been used `limit` times within
 * `windowSeconds`. Counting happens before the guarded work, so failed attempts count too.
 */
export async function hit(db: D1Database, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const row = await db.prepare(
    `INSERT INTO rate_limits(key,window_start,count) VALUES(?,CURRENT_TIMESTAMP,1)
     ON CONFLICT(key) DO UPDATE SET
       count=CASE WHEN window_start<=datetime('now',?) THEN 1 ELSE count+1 END,
       window_start=CASE WHEN window_start<=datetime('now',?) THEN CURRENT_TIMESTAMP ELSE window_start END
     RETURNING count`
  ).bind(key, `-${windowSeconds} seconds`, `-${windowSeconds} seconds`).first<{ count: number }>();
  return (row?.count || 0) <= limit;
}
export async function limitOr429(db: D1Database, key: string, limit: number, windowSeconds: number, message = 'Juda koʻp urinish. Birozdan keyin qayta urinib koʻring.') {
  if (!(await hit(db, key, limit, windowSeconds))) fail(429, 'RATE_LIMITED', message);
}

export async function audit(db: D1Database, adminId: number | null, action: string, target: string, detail: unknown = '') {
  await db.prepare('INSERT INTO audit_log(admin_id,action,target,detail) VALUES(?,?,?,?)').bind(adminId, action, target, typeof detail === 'string' ? detail : JSON.stringify(detail)).run();
}
export async function orderEvent(db: D1Database, orderId: number, actorType: 'admin' | 'courier' | 'customer' | 'system', actorId: number | null, event: string, detail: unknown = '') {
  await db.prepare('INSERT INTO order_events(order_id,actor_type,actor_id,event,detail) VALUES(?,?,?,?,?)').bind(orderId, actorType, actorId, event, typeof detail === 'string' ? detail : JSON.stringify(detail)).run();
}

export const uzPhone = z.string().trim().regex(/^\+998\d{9}$/, 'Telefon +998XXXXXXXXX koʻrinishida boʻlishi kerak');
export const strongPassword = z.string().min(10, 'Parol kamida 10 ta belgi').max(200);
export const coordinates = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100000).optional() });

export const settingsMap = async (db: D1Database): Promise<Record<string, string>> => Object.fromEntries((await db.prepare('SELECT key,value FROM settings').all<{ key: string; value: string }>()).results.map(r => [r.key, r.value]));
export const putSettings = (db: D1Database, entries: [string, string][]) => entries.map(([k, v]) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, v));
/** Store pickup point from settings; lat/lng are null until the owner sets them. */
export async function storeLocation(db: D1Database) {
  const rows = (await db.prepare("SELECT key,value FROM settings WHERE key IN ('store_lat','store_lng','store_address','store_place_name','store_name')").all<{ key: string; value: string }>()).results;
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const lat = Number(s.store_lat), lng = Number(s.store_lng);
  return { name: s.store_place_name || s.store_name || 'Fayz Market', address: s.store_address || '', lat: s.store_lat && Number.isFinite(lat) ? lat : null, lng: s.store_lng && Number.isFinite(lng) ? lng : null };
}
/** Great-circle distance in metres. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const ownerOnly = (c: { get: (k: 'admin') => Staff }) => { if (c.get('admin').role !== 'owner') fail(403, 'FORBIDDEN', 'Faqat doʻkon egasi (super admin) ruxsat etilgan'); };
export const staffOnly = (c: { get: (k: 'admin') => Staff }) => { if (!['owner', 'manager'].includes(c.get('admin').role)) fail(403, 'FORBIDDEN', 'Ruxsat yoʻq'); };
/** Our own R2 image URL (as returned by an upload) or '' — nothing else may be stored as a logo/banner image. */
export const isOwnImageUrl = (env: Bindings, v: string) => v.startsWith(`${env.PUBLIC_BASE_URL}/images/`) && /^[a-f0-9]{32}\.(png|jpg|webp)$/.test(v.slice(env.PUBLIC_BASE_URL.length + 8));
export const ownImageUrl = (env: Bindings) => z.string().trim().max(300).refine(v => v === '' || isOwnImageUrl(env, v), 'Rasm manzili notoʻgʻri');

/** Width/height from a PNG, JPEG or WebP header; null when the bytes are not one of those images. */
export function imageInfo(bytes: Uint8Array): { type: 'png' | 'jpg' | 'webp'; width: number; height: number } | null {
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  if (bytes.length > 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type: 'png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { type: 'jpg', height: u16(i + 5), width: u16(i + 7) };
      i += 2 + u16(i + 2);
    }
    return null;
  }
  if (bytes.length > 30 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8 ') return { type: 'webp', width: ((bytes[27] << 8) | bytes[26]) & 0x3fff, height: ((bytes[29] << 8) | bytes[28]) & 0x3fff };
    if (chunk === 'VP8L') { const b = bytes.slice(21, 25); return { type: 'webp', width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) }; }
    if (chunk === 'VP8X') return { type: 'webp', width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
  }
  return null;
}
