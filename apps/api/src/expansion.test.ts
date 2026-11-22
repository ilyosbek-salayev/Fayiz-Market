import { describe, expect, it } from 'vitest';
import { dataCheckString, telegramSignature, verifyTelegramLogin } from './telegram';
import { ACTIVE, FINISHED, REASSIGNABLE, TRACKABLE, courierTransitions, haversine, nextDeliveryStatus, stageOf, stepsToShipped } from './lifecycle';
import { generateCode, hashCode, smsStatus } from './otp';

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
    expect(smsStatus({ ENVIRONMENT: 'development', OTP_DEV_ECHO: '1' } as never).devEcho).toBe(true);
    expect(smsStatus({ SMS_PROVIDER: 'eskiz', ESKIZ_EMAIL: 'a', ESKIZ_PASSWORD: 'b' } as never).configured).toBe(true);
    expect(smsStatus({} as never).configured).toBe(false);
  });
});
