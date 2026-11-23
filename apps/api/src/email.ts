// One-time email codes through a real provider (Resend HTTP API), configured only with Cloudflare secrets.
// Without a provider the API answers 503 instead of pretending a code was sent. Local test mode (see lib.ts
// isDevelopment) may echo the code in the response; a deployed Worker never does.
import type { Bindings } from './lib';
import { isDevelopment, providerBase } from './lib';

export type EmailStatus = { configured: boolean; provider: string; devEcho: boolean };
export function emailStatus(env: Bindings): EmailStatus {
  const provider = (env.EMAIL_PROVIDER || '').toLowerCase();
  const configured = provider === 'resend' && !!env.RESEND_API_KEY && !!env.EMAIL_FROM;
  return { configured, provider: provider || 'none', devEcho: isDevelopment(env) && env.OTP_DEV_ECHO === '1' };
}

const base = (env: Bindings) => providerBase(env, 'resend', 'https://api.resend.com');
const escape = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export function codeEmail(code: string, purpose: string) {
  const action = purpose === 'reset' ? 'parolni tiklash' : purpose === 'login' ? 'hisobga kirish' : purpose === 'link' ? 'emailni tasdiqlash' : 'roʻyxatdan oʻtish';
  const subject = `Fayz Market: ${action} kodi ${code}`;
  const text = `Fayz Market — ${action} uchun kod: ${code}\nKod 5 daqiqa amal qiladi. Kodni hech kimga bermang.\nAgar bu siz boʻlmasangiz, xatni eʼtiborsiz qoldiring.`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1E1E1E"><p style="margin:0 0 8px;font-size:15px">Fayz Market — ${escape(action)} uchun kod:</p><p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:6px">${escape(code)}</p><p style="margin:0;font-size:13px;color:#6B6B6B">Kod 5 daqiqa amal qiladi. Kodni hech kimga bermang. Agar bu siz boʻlmasangiz, xatni eʼtiborsiz qoldiring.</p></div>`;
  return { subject, text, html };
}

/** Sends one email. Throws when the provider is not configured or refuses the message. */
export async function sendEmail(env: Bindings, to: string, message: { subject: string; text: string; html: string }): Promise<void> {
  if (!emailStatus(env).configured) throw new Error('EMAIL_NOT_CONFIGURED');
  const res = await fetch(`${base(env)}/emails`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: message.subject, text: message.text, html: message.html }),
  });
  if (!res.ok) throw new Error(`Email provider refused (${res.status})`);
}

/** Connection test for the integrations screen: checks the sender domain is verified; sends nothing. */
export async function testEmail(env: Bindings): Promise<string> {
  if (!emailStatus(env).configured) return 'Sozlanmagan';
  const domain = (env.EMAIL_FROM!.match(/@([^>\s]+)>?\s*$/)?.[1] || '').toLowerCase();
  const res = await fetch(`${base(env)}/domains`, { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } });
  if (res.status === 401) throw new Error('Resend API kaliti qabul qilinmadi');
  // A "sending access" key may not list domains; that is a valid key, but the domain cannot be confirmed here.
  if (res.status === 403) return `Kalit qabul qilindi (faqat yuborish ruxsati). ${domain} domeni Resend’da «verified» ekanini tekshiring.`;
  const data = await res.json<any>().catch(() => ({}));
  const found = (data?.data || []).find((d: any) => String(d.name).toLowerCase() === domain);
  if (!found) throw new Error(`${domain || 'EMAIL_FROM'} domeni Resend hisobida topilmadi`);
  if (found.status !== 'verified') throw new Error(`${domain} domeni hali tasdiqlanmagan (holat: ${found.status})`);
  return `${domain} domeni tasdiqlangan`;
}
