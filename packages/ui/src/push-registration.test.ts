import { expect, it, vi } from 'vitest';
import { pushRegistration } from './push-registration';
it('registers once, replaces a refreshed token and cleans up on logout', async () => {
 let token = 'device-one'; const request = vi.fn(async () => {}); const revoke = vi.fn(async () => {});
 const registration = pushRegistration({ token: async () => token, revoke }, request, 'customer');
 await registration.sync(); await registration.sync(); token = 'device-two'; await registration.sync(); await registration.stop(); await registration.sync();
 expect(request.mock.calls.map(call => (call as unknown as [string, {method:string}])[1].method)).toEqual(['POST','DELETE','POST','DELETE']);
 expect(revoke).toHaveBeenCalledOnce();
});
it('does nothing on non-Firebase builds', async () => {
 const request = vi.fn(async () => {});
 await pushRegistration({ token: async () => null, revoke: async () => {} }, request, 'admin').sync();
 expect(request).not.toHaveBeenCalled();
});
it('revokes the native device token even when offline cleanup fails', async () => {
 const request = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'));
 const revoke = vi.fn(async () => {});
 const registration = pushRegistration({ token: async () => 'token', revoke }, request, 'admin');
 await registration.sync(); await expect(registration.stop()).rejects.toThrow('offline'); expect(revoke).toHaveBeenCalledOnce();
});
