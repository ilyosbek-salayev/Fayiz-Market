// Notifications. Business events are decided here in the Worker:
//  1. a row in `notifications` (staff / a specific courier) that the admin apps poll — always works;
//  2. an FCM HTTP v1 push to registered devices — only when FCM_SERVICE_ACCOUNT is configured.
// Customer pushes use the same FCM path; customer apps also derive notices from their order status.
import type { Bindings } from './lib';
import { providerBase } from './lib';

type Audience = 'staff' | 'courier' | 'customer';
export type Notice = { audience: 'staff' | 'courier'; recipientId?: number | null; orderId?: number | null; kind: string; title: string; body: string };

export async function notify(env: Bindings, ctx: { waitUntil(p: Promise<unknown>): void } | undefined, notice: Notice) {
  await env.DB.prepare('INSERT INTO notifications(audience,recipient_id,order_id,kind,title,body) VALUES(?,?,?,?,?,?)')
    .bind(notice.audience, notice.recipientId ?? null, notice.orderId ?? null, notice.kind, notice.title, notice.body).run();
  const job = pushTo(env, notice.audience, notice.recipientId ?? null, notice).catch(error => console.error(JSON.stringify({ event: 'push_failed', error: String(error) })));
  if (ctx) ctx.waitUntil(job); else await job;
}

export async function pushCustomer(env: Bindings, ctx: { waitUntil(p: Promise<unknown>): void } | undefined, customerId: number | null, notice: Omit<Notice, 'audience'>) {
  if (!customerId) return;
  const job = pushTo(env, 'customer', customerId, notice).catch(error => console.error(JSON.stringify({ event: 'push_failed', error: String(error) })));
  if (ctx) ctx.waitUntil(job); else await job;
}

async function pushTo(env: Bindings, audience: Audience, recipientId: number | null, notice: Omit<Notice, 'audience'>) {
  if (!env.FCM_SERVICE_ACCOUNT) return;
  const query = audience === 'staff'
    ? env.DB.prepare("SELECT p.token FROM push_tokens p JOIN admins a ON a.id=p.principal_id WHERE p.audience='staff' AND a.active=1 AND a.role IN ('owner','manager') AND p.failures<5")
    : audience === 'courier'
      ? env.DB.prepare("SELECT p.token FROM push_tokens p JOIN admins a ON a.id=p.principal_id WHERE p.audience='courier' AND p.principal_id=? AND a.active=1 AND a.role='courier' AND p.failures<5").bind(recipientId)
      : env.DB.prepare('SELECT token FROM push_tokens WHERE audience=? AND principal_id=? AND failures<5').bind(audience, recipientId);
  const tokens = (await query.all<{ token: string }>()).results.map(r => r.token);
  if (!tokens.length) return;
  const account = JSON.parse(env.FCM_SERVICE_ACCOUNT) as { project_id: string; client_email: string; private_key: string };
  const access = await googleAccessToken(account, env);
  for (const token of tokens) {
    const res = await fetch(`${providerBase(env, 'fcm', 'https://fcm.googleapis.com')}/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, notification: { title: notice.title, body: notice.body }, data: { kind: notice.kind, orderId: String(notice.orderId ?? '') }, android: { priority: 'high', notification: { channel_id: audience === 'customer' ? 'orders' : 'operations', tag: `${notice.kind}-${notice.orderId ?? ''}` } } } }),
    });
    if (res.ok) await env.DB.prepare('UPDATE push_tokens SET failures=0,last_seen_at=CURRENT_TIMESTAMP WHERE token=?').bind(token).run();
    else if (res.status === 404) await env.DB.prepare('DELETE FROM push_tokens WHERE token=?').bind(token).run(); // unregistered; a generic 400 can be a payload error, not a dead device
    else await env.DB.prepare('UPDATE push_tokens SET failures=failures+1 WHERE token=?').bind(token).run();
  }
}

let cached: { token: string; until: number; url: string; identity: string } | null = null;
const b64url = (data: ArrayBuffer | string) => btoa(typeof data === 'string' ? data : String.fromCharCode(...new Uint8Array(data))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** OAuth2 service-account JWT flow (RS256) for the FCM HTTP v1 API. */
export async function googleAccessToken(account: { client_email: string; private_key: string }, env?: Bindings): Promise<string> {
  const tokenUrl = env ? `${providerBase(env, 'google-oauth', 'https://oauth2.googleapis.com')}/token` : 'https://oauth2.googleapis.com/token';
  if (cached && cached.until > Date.now() && cached.url === tokenUrl && cached.identity === account.client_email) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), ch => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claims}.${b64url(signature)}` });
  const data = await res.json<any>().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Google OAuth failed (${res.status})`);
  cached = { token: data.access_token, until: Date.now() + 50 * 60 * 1000, url: tokenUrl, identity: account.client_email };
  return cached.token;
}
