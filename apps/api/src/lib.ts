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
};
export type Role = 'owner' | 'manager' | 'courier';
export type Staff = { id: number; role: Role };
export type Customer = { id: number; phone: string | null; name: string; telegramId: string | null };
export type Variables = { admin: Staff; customer: Customer };
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
export const isDevelopment = (env: Bindings) => env.ENVIRONMENT === 'development' && /^http:\/\//.test(env.PUBLIC_BASE_URL || '');
export type Provider = 'eskiz' | 'resend' | 'google-oauth' | 'fcm' | 'telegram' | 'routes';
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
