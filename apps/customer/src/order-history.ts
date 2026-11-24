/** A missing guest order must not hide successful guest or account requests. Never delete stored tokens. */
export async function loadOrderHistory<T>(guestRequests: (() => Promise<T>)[], accountRequest: () => Promise<T[]>) {
  const [guests, account] = await Promise.all([
    Promise.allSettled(guestRequests.map(request => Promise.resolve().then(request))),
    Promise.resolve().then(accountRequest).then(
      orders => ({ ok: true as const, orders }),
      error => ({ ok: false as const, error }),
    ),
  ]);
  return {
    guests: guests.flatMap(result => result.status === 'fulfilled' ? [result.value] : []),
    failedGuests: guests.filter(result => result.status === 'rejected').length,
    account,
  };
}
