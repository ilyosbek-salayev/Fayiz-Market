// Kept outside src/ (like deploy-config.test.ts) so the Worker typecheck (workers-types only) does not see Node APIs.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { imageInfo, isOwnImageUrl, type Bindings } from './src/lib';
import { checkoutOptions, clickSignString, customerPaymentView, onlineReady } from './src/payments';
import { decodePolyline, routingProvider } from './src/routing';
import { keyId, masterKey, seal, unseal } from './src/secrets';
import { ctaTarget } from './src/storefront';

const env = (extra: Partial<Bindings> = {}) => ({ PUBLIC_BASE_URL: 'https://api.example', ...extra }) as Bindings;
const KEY = Buffer.alloc(32, 7).toString('base64');

describe('integration secrets (AES-256-GCM)', () => {
  it('round-trips and never stores the plaintext', async () => {
    const key = masterKey({ INTEGRATIONS_MASTER_KEY: KEY })!;
    const sealed = await seal(key, 'PAYME_KEY', 'super-secret-value');
    expect(sealed.ciphertext).not.toContain('super-secret-value');
    expect(Buffer.from(sealed.ciphertext, 'base64').toString('latin1')).not.toContain('super-secret-value');
    expect(await unseal(key, 'PAYME_KEY', sealed)).toBe('super-secret-value');
    expect(sealed.keyId).toBe(await keyId(key));
  });
  it('a ciphertext cannot be moved to another secret name or opened with another key', async () => {
    const key = masterKey({ INTEGRATIONS_MASTER_KEY: KEY })!;
    const sealed = await seal(key, 'PAYME_KEY', 'v');
    await expect(unseal(key, 'CLICK_SECRET_KEY', sealed)).rejects.toThrow();
    await expect(unseal(masterKey({ INTEGRATIONS_MASTER_KEY: Buffer.alloc(32, 9).toString('base64') })!, 'PAYME_KEY', sealed)).rejects.toThrow();
  });
  it('uses a fresh IV every time', async () => {
    const key = masterKey({ INTEGRATIONS_MASTER_KEY: KEY })!;
    const [a, b] = [await seal(key, 'X', 'same'), await seal(key, 'X', 'same')];
    expect(a.iv).not.toBe(b.iv); expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it('rejects a missing or malformed master key', () => {
    expect(masterKey({})).toBeNull();
    expect(masterKey({ INTEGRATIONS_MASTER_KEY: 'short' })).toBeNull();
    expect(masterKey({ INTEGRATIONS_MASTER_KEY: Buffer.alloc(16).toString('base64') })).toBeNull();
  });
});

describe('image validation', () => {
  const png = (w: number, h: number) => { const b = Buffer.alloc(33); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return new Uint8Array(b); };
  it('reads PNG dimensions', () => expect(imageInfo(png(512, 500))).toEqual({ type: 'png', width: 512, height: 500 }));
  it('reads JPEG SOF dimensions', () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0x90, 0x02, 0x58, 3, 0, 0, 0]);
    expect(imageInfo(jpg)).toEqual({ type: 'jpg', width: 600, height: 400 });
  });
  it('refuses SVG, HTML and truncated data', () => {
    expect(imageInfo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(imageInfo(new TextEncoder().encode('<html>'))).toBeNull();
    expect(imageInfo(new Uint8Array([137, 80, 78, 71]))).toBeNull();
  });
  it('accepts only our own R2 image URLs', () => {
    expect(isOwnImageUrl(env(), 'https://api.example/images/0123456789abcdef0123456789abcdef.png')).toBe(true);
    expect(isOwnImageUrl(env(), 'https://evil.example/images/0123456789abcdef0123456789abcdef.png')).toBe(false);
    expect(isOwnImageUrl(env(), 'https://api.example/images/../secret.png')).toBe(false);
    expect(isOwnImageUrl(env(), 'https://api.example.evil/images/0123456789abcdef0123456789abcdef.png')).toBe(false);
  });
});

describe('banner links', () => {
  it('allows only in-app targets', () => {
    for (const ok of ['none', 'catalog', 'store', 'category:soatlar', 'product:qora-soat-2']) expect(ctaTarget.safeParse(ok).success).toBe(true);
    for (const bad of ['javascript:alert(1)', 'https://evil.example', 'category:', 'product:Qora Soat', 'store:x']) expect(ctaTarget.safeParse(bad).success).toBe(false);
  });
});

describe('routing', () => {
  it('decodes Google encoded polylines to [lng, lat]', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  });
  it('prefers OpenRouteService, then Google, else none (no fake straight line)', () => {
    expect(routingProvider(env({ ORS_API_KEY: 'k', GOOGLE_ROUTES_KEY: 'g' }))).toBe('openrouteservice');
    expect(routingProvider(env({ GOOGLE_ROUTES_KEY: 'g' }))).toBe('google');
    expect(routingProvider(env())).toBeNull();
  });
});

describe('checkout options', () => {
  const store = { address: 'Toshkent, Chilonzor 1', lat: 41, lng: 69 };
  it('defaults to cash + delivery (1.1.x behaviour)', () => {
    const o = checkoutOptions(env(), {}, { address: '', lat: null, lng: null });
    expect(o.payments.map(p => p.method)).toEqual(['cash']); expect(o.fulfillment).toEqual(['delivery']);
  });
  it('never leaves checkout without a method', () => expect(checkoutOptions(env(), { payment_cash: '0' }, store).payments.map(p => p.method)).toEqual(['cash']));
  it('offers pickup only with a store address', () => {
    expect(checkoutOptions(env(), { fulfillment_pickup: '1' }, store).fulfillment).toEqual(['delivery', 'pickup']);
    expect(checkoutOptions(env(), { fulfillment_pickup: '1' }, { address: '', lat: null, lng: null }).fulfillment).toEqual(['delivery']);
  });
  it('shows an online provider only when switched on AND configured', () => {
    const s = { payme_enabled: '1', payme_merchant_id: 'a'.repeat(24), payme_mode: 'test' };
    expect(onlineReady.payme(env(), s)).toBe(false); // no key
    expect(onlineReady.payme(env({ PAYME_KEY: 'prod-only' }), s)).toBe(false); // test mode needs the test key
    expect(onlineReady.payme(env({ PAYME_TEST_KEY: 'k' }), s)).toBe(true);
    expect(onlineReady.payme(env({ PAYME_TEST_KEY: 'k' }), { ...s, payme_enabled: '0' })).toBe(false);
    expect(onlineReady.click(env({ CLICK_SECRET_KEY: 'k' }), { click_enabled: '1', click_service_id: '1', click_merchant_id: '2' })).toBe(true);
    expect(onlineReady.click(env(), { click_enabled: '1', click_service_id: '1', click_merchant_id: '2' })).toBe(false);
  });
  it('bank details are shown to the customer only while the transfer is open', () => {
    const row = { id: 1, order_number: 'N', total: 100, status: 'new', payment_method: 'bank_transfer' as const, payment_status: 'pending', customer_id: null };
    expect(customerPaymentView(row, { bank_transfer_details: 'X' }).bankTransferDetails).toBe('X');
    expect(customerPaymentView({ ...row, payment_status: 'paid' }, { bank_transfer_details: 'X' }).bankTransferDetails).toBe('');
    expect(customerPaymentView({ ...row, status: 'cancelled' }, { bank_transfer_details: 'X' }).canClaimTransfer).toBe(false);
  });
});

describe('Click signature', () => {
  it('matches the documented sign_string layout (prepare and complete)', () => {
    const f = { click_trans_id: '9001', service_id: '4321', merchant_trans_id: '7', amount: '300000.00', action: '0', sign_time: '2026-11-25 10:00:00', merchant_prepare_id: '55' };
    expect(clickSignString(f, 'SECRET')).toBe('90014321SECRET7300000.0002026-11-25 10:00:00');
    expect(clickSignString({ ...f, action: '1' }, 'SECRET')).toBe('90014321SECRET755300000.0012026-11-25 10:00:00');
    expect(createHash('md5').update(clickSignString(f, 'SECRET')).digest('hex')).toHaveLength(32);
  });
});
