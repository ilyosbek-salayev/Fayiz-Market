import { describe, expect, it } from 'vitest';
import { dataCheckString, telegramSignature, verifyTelegramLogin } from './telegram';
import { ACTIVE, FINISHED, REASSIGNABLE, TRACKABLE, courierTransitions, haversine, nextDeliveryStatus, stageOf, stepsToShipped } from './lifecycle';
import { generateCode, hashCode, smsStatus } from './otp';
import { emailStatus, codeEmail } from './email';
import { isDevelopment, providerBase } from './lib';

const BOT = '123456789:AAH-test-token-for-unit-tests-only';
const now = 1_800_000_000;
async function signed(extra: Record<string, string> = {}) {
  const data: Record<string, string> = { id: '42', first_name: 'Ali', username: 'ali_uz', auth_date: String(now - 30), ...extra };
  return { ...data, hash: await telegramSignature(data, BOT) };
}

describe('Telegram login verification', () => {
  it('builds the data-check-string exactly as Telegram documents it', () => {
    expect(dataCheckString({ id: '1', auth_date: '2', first_name: 'A', hash: 'x' })).toBe('auth_date=2\nfirst_name=A\nid=1');
  });
  it('accepts a correctly signed, fresh payload', async () => {
    const result = await verifyTelegramLogin(await signed(), BOT, now);
    expect(result.ok).toBe(true);
  });
  it('rejects a forged field, a wrong bot token and a malformed hash', async () => {
    const good = await signed();
    expect(await verifyTelegramLogin({ ...good, id: '43' }, BOT, now)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
    expect(await verifyTelegramLogin(good, '987:other-bot', now)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
    expect(await verifyTelegramLogin({ ...good, hash: 'zz' }, BOT, now)).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(await verifyTelegramLogin(null, BOT, now)).toEqual({ ok: false, reason: 'MALFORMED' });
  });
  it('rejects stale and future-dated payloads (replay window)', async () => {
    expect(await verifyTelegramLogin(await signed({ auth_date: String(now - 3600) }), BOT, now)).toEqual({ ok: false, reason: 'EXPIRED' });
    expect(await verifyTelegramLogin(await signed({ auth_date: String(now + 3600) }), BOT, now)).toEqual({ ok: false, reason: 'FUTURE' });
  });
  it('ignores fields Telegram never sends instead of letting them alter the check', async () => {
    const good = await signed();
    expect((await verifyTelegramLogin({ ...good, role: 'admin' }, BOT, now)).ok).toBe(true);
  });
});

describe('delivery lifecycle', () => {
  it('allows only the documented courier sequence', () => {
    expect(nextDeliveryStatus('assigned', 'accept')).toBe('accepted');
    expect(nextDeliveryStatus('accepted', 'pickup')).toBe('picked_up');
    expect(nextDeliveryStatus('picked_up', 'depart')).toBe('on_the_way');
    expect(nextDeliveryStatus('on_the_way', 'arrive')).toBe('arrived');
    expect(nextDeliveryStatus('arrived', 'handover')).toBe('handed_over');
    expect(nextDeliveryStatus('assigned', 'decline')).toBe('declined');
  });
  it('refuses skipped, repeated or post-completion steps', () => {
    expect(nextDeliveryStatus('assigned', 'pickup')).toBeNull();
    expect(nextDeliveryStatus('accepted', 'handover')).toBeNull();
    expect(nextDeliveryStatus('accepted', 'accept')).toBeNull();
    expect(nextDeliveryStatus('handed_over', 'handover')).toBeNull();
    expect(nextDeliveryStatus('confirmed', 'arrive')).toBeNull();
    expect(nextDeliveryStatus('picked_up', 'decline')).toBeNull();
    for (const rule of Object.values(courierTransitions)) for (const from of rule.from) expect(FINISHED).not.toContain(from);
  });
  it('combines order status and courier status into one customer stage', () => {
    expect(stageOf('new', null)).toBe('pending');
    expect(stageOf('confirmed', null)).toBe('confirmed');
    expect(stageOf('confirmed', 'assigned')).toBe('assigned');
    expect(stageOf('preparing', 'accepted')).toBe('courier_accepted');
    expect(stageOf('shipped', 'on_the_way')).toBe('on_the_way');
    expect(stageOf('shipped', 'handed_over')).toBe('delivered_pending_confirmation');
    expect(stageOf('delivered', 'confirmed')).toBe('delivered');
    expect(stageOf('cancelled', 'assigned')).toBe('cancelled');
  });
  it('never exposes location before pickup or after completion and blocks reassignment after pickup', () => {
    expect(TRACKABLE).toEqual(['picked_up', 'on_the_way', 'arrived']);
    for (const s of ['picked_up', 'on_the_way', 'arrived', 'handed_over'] as const) expect(REASSIGNABLE).not.toContain(s);
    expect(ACTIVE).not.toContain('handed_over');
  });
  it('walks the order status one trigger-approved step at a time', () => {
    expect(stepsToShipped('confirmed')).toEqual(['preparing', 'shipped']);
    expect(stepsToShipped('preparing')).toEqual(['shipped']);
    expect(stepsToShipped('shipped')).toEqual([]);
  });
  it('computes great-circle distance', () => {
    expect(Math.round(haversine({ lat: 41.3111, lng: 69.2797 }, { lat: 41.3111, lng: 69.2797 }))).toBe(0);
    expect(Math.round(haversine({ lat: 41.0, lng: 69.0 }, { lat: 42.0, lng: 69.0 }) / 1000)).toBe(111);
  });
});

describe('one-time codes', () => {
  it('produces 6-digit codes and salted hashes', async () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    const a = await hashCode('123456', '+998901234567', 'salt1'), b = await hashCode('123456', '+998901234567', 'salt2');
    expect(a).toMatch(/^[a-f0-9]{64}$/); expect(a).not.toBe(b);
  });
  it('never enables the development echo in production', () => {
    expect(smsStatus({ ENVIRONMENT: 'production', OTP_DEV_ECHO: '1' } as never).devEcho).toBe(false);
    expect(smsStatus({ ENVIRONMENT: 'development', OTP_DEV_ECHO: '1', PUBLIC_BASE_URL: 'http://127.0.0.1:8788' } as never).devEcho).toBe(true);
    // A missing ENVIRONMENT, or "development" on an https (deployed) URL, is not local test mode either.
    expect(smsStatus({ OTP_DEV_ECHO: '1', PUBLIC_BASE_URL: 'http://127.0.0.1:8788' } as never).devEcho).toBe(false);
    expect(smsStatus({ ENVIRONMENT: 'development', OTP_DEV_ECHO: '1', PUBLIC_BASE_URL: 'https://fayz-market-api.example.workers.dev' } as never).devEcho).toBe(false);
    expect(emailStatus({ ENVIRONMENT: 'production', OTP_DEV_ECHO: '1', PUBLIC_BASE_URL: 'http://127.0.0.1:8788' } as never).devEcho).toBe(false);
    expect(smsStatus({ SMS_PROVIDER: 'eskiz', ESKIZ_EMAIL: 'a', ESKIZ_PASSWORD: 'b' } as never).configured).toBe(true);
    expect(smsStatus({} as never).configured).toBe(false);
  });
});

describe('local test mode isolation', () => {
  const local = { ENVIRONMENT: 'development', PUBLIC_BASE_URL: 'http://127.0.0.1:8789', DEV_MOCK_PROVIDERS: 'http://127.0.0.1:8790' };
  it('routes providers to the local mock only in local development', () => {
    expect(isDevelopment(local as never)).toBe(true);
    expect(providerBase(local as never, 'fcm', 'https://fcm.googleapis.com')).toBe('http://127.0.0.1:8790/fcm');
  });
  it('ignores the mock override in production or on a deployed URL', () => {
    expect(providerBase({ ...local, ENVIRONMENT: 'production' } as never, 'fcm', 'https://fcm.googleapis.com')).toBe('https://fcm.googleapis.com');
    expect(providerBase({ ...local, PUBLIC_BASE_URL: 'https://x.workers.dev' } as never, 'resend', 'https://api.resend.com')).toBe('https://api.resend.com');
    expect(providerBase({ ...local, ENVIRONMENT: undefined } as never, 'eskiz', 'https://notify.eskiz.uz')).toBe('https://notify.eskiz.uz');
  });
  it('accepts only a loopback http origin as the mock', () => {
    expect(providerBase({ ...local, DEV_MOCK_PROVIDERS: 'https://evil.example' } as never, 'telegram', 'https://api.telegram.org')).toBe('https://api.telegram.org');
    expect(providerBase({ ...local, DEV_MOCK_PROVIDERS: 'http://10.0.0.5:8790' } as never, 'telegram', 'https://api.telegram.org')).toBe('https://api.telegram.org');
  });
});

describe('email codes', () => {
  it('needs a real provider configuration', () => {
    expect(emailStatus({} as never).configured).toBe(false);
    expect(emailStatus({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' } as never).configured).toBe(false);
    expect(emailStatus({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'Fayz <kod@fayz.uz>' } as never).configured).toBe(true);
  });
  it('puts the code in the message and escapes HTML', () => {
    const m = codeEmail('482913', 'login');
    expect(m.subject).toContain('482913'); expect(m.text).toContain('482913'); expect(m.html).toContain('482913');
    expect(codeEmail('<b>', 'register').html).not.toContain('<b>');
  });
});
