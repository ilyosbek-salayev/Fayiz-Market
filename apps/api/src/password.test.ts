import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_PBKDF2_ITERATIONS, PBKDF2_ITERATIONS, passwordHash, verifyPassword } from './password';

// Regression: production Workers reject PBKDF2 above 100 000 iterations, which broke admin login,
// bootstrap and adding administrators on Cloudflare while local `wrangler dev` kept working.
const WORKERS_PBKDF2_LIMIT = 100_000;

describe('admin password hashing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never asks WebCrypto for more iterations than Cloudflare Workers allow', async () => {
    const derive = vi.spyOn(crypto.subtle, 'deriveBits');
    const stored = await passwordHash('correct horse battery');
    await verifyPassword('correct horse battery', stored);
    await verifyPassword('wrong password here', stored);
    expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(WORKERS_PBKDF2_LIMIT);
    for (const [params] of derive.mock.calls) expect((params as Pbkdf2Params).iterations).toBeLessThanOrEqual(WORKERS_PBKDF2_LIMIT);
  });

  it('stores the iteration count and verifies only the right password', async () => {
    const stored = await passwordHash('correct horse battery');
    expect(stored.split(':')[1]).toBe(String(PBKDF2_ITERATIONS));
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterY', stored)).toBe(false);
  });

  it('still accepts hashes written before the fix (salt:hash, 310 000 iterations)', async () => {
    const salt = 'a'.repeat(64);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('legacy password 1'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: LEGACY_PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
    const legacy = `${salt}:${Array.from(new Uint8Array(bits)).map(x => x.toString(16).padStart(2, '0')).join('')}`;
    expect(await verifyPassword('legacy password 1', legacy)).toBe(true);
    expect(await verifyPassword('legacy password 2', legacy)).toBe(false);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    for (const bad of ['', 'nohash', 'salt:abc:def:ghi', 'salt:0:abc', 'salt:NaN:abc']) expect(await verifyPassword('anything 123', bad)).toBe(false);
  });
});
