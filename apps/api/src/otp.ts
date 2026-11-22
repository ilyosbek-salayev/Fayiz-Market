// One-time SMS codes. Codes are 6 random digits, stored only as a salted SHA-256, valid for 5 minutes,
// at most 5 guesses each. Sending goes through a real provider (Eskiz.uz) configured with Cloudflare
// secrets; without one the API answers 503 instead of pretending a code was sent.
import type { Bindings } from './lib';
import { isProduction, sha256 } from './lib';

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;

export function generateCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}
export const hashCode = (code: string, phone: string, salt: string) => sha256(`otp:${salt}:${phone}:${code}`);

export type SmsStatus = { configured: boolean; provider: string; devEcho: boolean };
export function smsStatus(env: Bindings): SmsStatus {
  const provider = (env.SMS_PROVIDER || '').toLowerCase();
  const configured = provider === 'eskiz' && !!env.ESKIZ_EMAIL && !!env.ESKIZ_PASSWORD;
  return { configured, provider: provider || 'none', devEcho: !isProduction(env) && env.OTP_DEV_ECHO === '1' };
}

let eskizToken: { value: string; until: number } | null = null;
async function eskizLogin(env: Bindings): Promise<string> {
  if (eskizToken && eskizToken.until > Date.now()) return eskizToken.value;
  const form = new FormData(); form.set('email', env.ESKIZ_EMAIL!); form.set('password', env.ESKIZ_PASSWORD!);
  const res = await fetch('https://notify.eskiz.uz/api/auth/login', { method: 'POST', body: form });
  const data = await res.json<any>().catch(() => ({}));
  const token = data?.data?.token;
  if (!res.ok || !token) throw new Error(`SMS provider login failed (${res.status})`);
  eskizToken = { value: token, until: Date.now() + 20 * 24 * 3600 * 1000 };
  return token;
}

/** Sends an SMS through the configured provider. Throws when it is not configured or the provider refuses. */
export async function sendSms(env: Bindings, phone: string, text: string): Promise<void> {
  const status = smsStatus(env);
  if (!status.configured) throw new Error('SMS_NOT_CONFIGURED');
  const token = await eskizLogin(env);
  const form = new FormData(); form.set('mobile_phone', phone.replace(/^\+/, '')); form.set('message', text); form.set('from', env.ESKIZ_FROM || '4546');
  const res = await fetch('https://notify.eskiz.uz/api/message/sms/send', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  if (res.status === 401) eskizToken = null;
  if (!res.ok) throw new Error(`SMS provider refused (${res.status})`);
}

/** Connection test for the integrations screen: only authenticates, sends nothing. */
export async function testSms(env: Bindings): Promise<string> {
  if (!smsStatus(env).configured) return 'Sozlanmagan';
  eskizToken = null; await eskizLogin(env); return 'Eskiz hisobiga ulanish muvaffaqiyatli';
}
