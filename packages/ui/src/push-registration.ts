/** Firebase shell adapter contract. A build without the optional native client returns null.
 * Poll/synchronize on sign-in and token refresh; stop before logout. Never persist auth tokens here.
 */
export type PushDevice = { token: () => Promise<string | null>; revoke: () => Promise<void> };
export type PushRequest = (path: string, init: { method: string; body: string }) => Promise<unknown>;
export function pushRegistration(device: PushDevice, request: PushRequest, audience: 'admin' | 'customer') {
  let registered: string | null = null;
  let stopped = false;
  let pending = Promise.resolve();
  const remove = (token: string) => request(`/${audience}/push-token`, { method: 'DELETE', body: JSON.stringify({ token }) });
  return {
    sync() {
      pending = pending.catch(() => undefined).then(async () => {
        if (stopped) return;
        const token = await device.token();
        if (stopped || !token || token === registered) return;
        if (registered) await remove(registered);
        registered = null;
        await request(`/${audience}/push-token`, { method: 'POST', body: JSON.stringify({ token, platform: 'android' }) });
        registered = token;
      });
      return pending;
    },
    async stop() {
      stopped = true;
      await pending.catch(() => undefined);
      // Native token deletion also prevents delivery when server cleanup fails offline.
      try { if (registered) await remove(registered); }
      finally { registered = null; await device.revoke(); }
    },
  };
}
