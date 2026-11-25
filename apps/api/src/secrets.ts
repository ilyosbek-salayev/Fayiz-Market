// Integration credentials entered in Admin → Integratsiyalar.
//  • Sealed with AES-256-GCM under the Cloudflare secret INTEGRATIONS_MASTER_KEY; the key itself never touches D1.
//  • The secret's name is the GCM additional data, so a ciphertext cannot be moved to another name.
//  • Decrypted only inside the Worker. No endpoint returns a value or a fragment of one — only "set / not set".
//  • A value set in the panel overrides a Cloudflare secret with the same name; removing it falls back to that secret.
import type { Bindings } from './lib';

export const MANAGED_SECRETS = [
  'TELEGRAM_BOT_TOKEN', 'SMS_PROVIDER', 'ESKIZ_EMAIL', 'ESKIZ_PASSWORD', 'ESKIZ_FROM', 'EMAIL_PROVIDER', 'RESEND_API_KEY', 'EMAIL_FROM',
  'FCM_SERVICE_ACCOUNT', 'GOOGLE_ROUTES_KEY', 'ORS_API_KEY', 'PAYME_KEY', 'PAYME_TEST_KEY', 'CLICK_SECRET_KEY',
] as const;
export type ManagedSecret = typeof MANAGED_SECRETS[number];
export const isManagedSecret = (name: string): name is ManagedSecret => (MANAGED_SECRETS as readonly string[]).includes(name);

const toB64 = (bytes: ArrayBuffer | Uint8Array) => { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const text = new TextEncoder();

/** The 32-byte master key, or null when INTEGRATIONS_MASTER_KEY is missing or malformed. */
export function masterKey(env: Pick<Bindings, 'INTEGRATIONS_MASTER_KEY'>): Uint8Array<ArrayBuffer> | null {
  const raw = env.INTEGRATIONS_MASTER_KEY?.trim();
  if (!raw) return null;
  try { const bytes = fromB64(raw); return bytes.length === 32 ? bytes : null; } catch { return null; }
}
/** Short, non-reversible identifier of the master key (detects values sealed with an older key). */
export async function keyId(key: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', key))).slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
}
const aes = (key: Uint8Array<ArrayBuffer>, use: KeyUsage) => crypto.subtle.importKey('raw', key, 'AES-GCM', false, [use]);

export async function seal(key: Uint8Array<ArrayBuffer>, name: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: text.encode(name) }, await aes(key, 'encrypt'), text.encode(value));
  return { ciphertext: toB64(ciphertext), iv: toB64(iv), keyId: await keyId(key) };
}
export async function unseal(key: Uint8Array<ArrayBuffer>, name: string, sealed: { ciphertext: string; iv: string }) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv), additionalData: text.encode(name) }, await aes(key, 'decrypt'), fromB64(sealed.ciphertext));
  return new TextDecoder().decode(plain);
}

export type SecretState = { stored: boolean; readable: boolean; updatedAt: string | null };
type Loaded = { at: number; values: Partial<Record<ManagedSecret, string>>; states: Partial<Record<ManagedSecret, SecretState>> };
let cache: Loaded | null = null;
const TTL_MS = 30_000;
/** Called after a panel change so this isolate sees it at once; other isolates refresh within TTL_MS. */
export const invalidateSecrets = () => { cache = null; };

export async function loadSecrets(env: Bindings): Promise<Loaded> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const loaded: Loaded = { at: Date.now(), values: {}, states: {} };
  let rows: { name: string; ciphertext: string; iv: string; key_id: string; updated_at: string }[] = [];
  try { rows = (await env.DB.prepare('SELECT name,ciphertext,iv,key_id,updated_at FROM integration_secrets').all<typeof rows[number]>()).results; }
  catch { /* table not migrated yet: nothing stored */ }
  const key = masterKey(env), id = key ? await keyId(key) : null;
  for (const row of rows) {
    if (!isManagedSecret(row.name)) continue;
    let readable = false;
    if (key && row.key_id === id) {
      try { loaded.values[row.name] = await unseal(key, row.name, row); readable = true; } catch { /* tampered or wrong key */ }
    }
    loaded.states[row.name] = { stored: true, readable, updatedAt: row.updated_at };
  }
  cache = loaded;
  return loaded;
}

/** Middleware: panel-managed credentials are merged into c.env for the rest of the request. */
export async function withManagedSecrets(c: { env: Bindings; set: (key: 'baseEnv', value: Bindings) => void }, next: () => Promise<void>) {
  c.set('baseEnv', c.env); // Cloudflare-only view, used to report where a credential comes from
  const { values } = await loadSecrets(c.env);
  if (Object.keys(values).length) c.env = { ...c.env, ...values };
  await next();
}
