// Delivery lifecycle rules. `orders.status` keeps its original values (new → confirmed → preparing →
// shipped → delivered | cancelled) so installed apps keep working; the courier stages live in
// `deliveries.status` and both are combined into one customer-facing `stage`.
export type DeliveryStatus = 'assigned' | 'accepted' | 'declined' | 'picked_up' | 'on_the_way' | 'arrived' | 'handed_over' | 'confirmed' | 'disputed' | 'resolved' | 'cancelled';
export type CourierAction = 'accept' | 'decline' | 'pickup' | 'depart' | 'arrive' | 'handover';
export type Stage = 'pending' | 'confirmed' | 'assigned' | 'courier_accepted' | 'picked_up' | 'on_the_way' | 'arrived' | 'delivered_pending_confirmation' | 'disputed' | 'delivered' | 'cancelled';

/** Courier actions: which delivery status each one requires and produces. */
export const courierTransitions: Record<CourierAction, { from: DeliveryStatus[]; to: DeliveryStatus; stamp?: string }> = {
  accept: { from: ['assigned'], to: 'accepted', stamp: 'accepted_at' },
  decline: { from: ['assigned'], to: 'declined' },
  pickup: { from: ['accepted'], to: 'picked_up', stamp: 'picked_up_at' },
  depart: { from: ['picked_up'], to: 'on_the_way' },
  arrive: { from: ['on_the_way'], to: 'arrived', stamp: 'arrived_at' },
  handover: { from: ['arrived'], to: 'handed_over', stamp: 'handed_over_at' },
};
/** Deliveries a courier is still working on (location sharing is allowed only for these). */
export const ACTIVE: DeliveryStatus[] = ['assigned', 'accepted', 'picked_up', 'on_the_way', 'arrived'];
/** Statuses in which the courier's live position may be shown to the customer. */
export const TRACKABLE: DeliveryStatus[] = ['picked_up', 'on_the_way', 'arrived'];
/** An admin may (re)assign before the goods leave the store. */
export const REASSIGNABLE: (DeliveryStatus | null)[] = [null, 'assigned', 'accepted', 'declined', 'cancelled'];
export const FINISHED: DeliveryStatus[] = ['confirmed', 'resolved', 'cancelled'];

export function nextDeliveryStatus(current: DeliveryStatus, action: CourierAction): DeliveryStatus | null {
  const rule = courierTransitions[action];
  return rule && rule.from.includes(current) ? rule.to : null;
}

export function stageOf(orderStatus: string, delivery: DeliveryStatus | null | undefined): Stage {
  if (orderStatus === 'cancelled') return 'cancelled';
  if (orderStatus === 'delivered') return 'delivered';
  switch (delivery) {
    case 'assigned': return 'assigned';
    case 'accepted': return 'courier_accepted';
    case 'picked_up': return 'picked_up';
    case 'on_the_way': return 'on_the_way';
    case 'arrived': return 'arrived';
    case 'handed_over': return 'delivered_pending_confirmation';
    case 'disputed': return 'disputed';
  }
  return orderStatus === 'new' ? 'pending' : 'confirmed';
}

/** Order-status steps needed to reach `shipped` from the current status (the D1 trigger allows single steps only). */
export function stepsToShipped(orderStatus: string): string[] {
  if (orderStatus === 'confirmed') return ['preparing', 'shipped'];
  if (orderStatus === 'preparing') return ['shipped'];
  return [];
}

/** Great-circle distance in metres between two coordinates (used only to sanity-check GPS jumps). */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
