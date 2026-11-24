import { describe, expect, it } from 'vitest';
import { loadOrderHistory } from './order-history';

describe('order history partial failures', () => {
  it('keeps valid guest and account orders when a saved order is missing', async () => {
    const result = await loadOrderHistory([async () => ({ id: 1 }), async () => { throw new Error('404'); }], async () => [{ id: 3 }]);
    expect(result.guests).toEqual([{ id: 1 }]);
    expect(result.failedGuests).toBe(1);
    expect(result.account).toEqual({ ok: true, orders: [{ id: 3 }] });
  });
  it('keeps guest orders when the account session expires', async () => {
    const result = await loadOrderHistory([async () => 1], async () => { throw new Error('401'); });
    expect(result.guests).toEqual([1]);
    expect(result.account.ok).toBe(false);
  });
  it('reports all failures instead of presenting an empty successful history', async () => {
    const result = await loadOrderHistory([async () => { throw new TypeError('offline'); }], async () => []);
    expect(result.failedGuests).toBe(1);
    expect(result.guests).toEqual([]);
  });
  it('handles an empty history', async () => {
    expect(await loadOrderHistory([], async () => [])).toEqual({ guests: [], failedGuests: 0, account: { ok: true, orders: [] } });
  });
});
