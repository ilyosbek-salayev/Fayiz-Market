import { describe, expect, it } from 'vitest';
import { isDevelopment, providerBase } from './lib';
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password';
describe('audit security regressions', () => {
  it.each(['http://example.com', 'http://localhost.evil.test', 'https://127.0.0.1', 'invalid', 'http://127.0.0.1@evil.test'])('disables dev echo on %s', PUBLIC_BASE_URL => {
    const env = { ENVIRONMENT: 'development', PUBLIC_BASE_URL, DEV_MOCK_PROVIDERS: 'http://127.0.0.1:8789' } as never;
    expect(isDevelopment(env)).toBe(false);
    expect(providerBase(env, 'fcm', 'https://fcm.googleapis.com')).toBe('https://fcm.googleapis.com');
  });
  it.each(['http://localhost:8788','http://127.0.0.1:8788','http://[::1]:8788'])('permits explicit loopback development on %s', PUBLIC_BASE_URL => {
    expect(isDevelopment({ ENVIRONMENT: 'development', PUBLIC_BASE_URL } as never)).toBe(true);
  });
  it('dummy hash cannot authenticate an unknown account', async () => {
    expect(await verifyPassword('invalid-password', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});
