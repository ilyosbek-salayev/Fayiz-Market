// Customer-facing order stages (combined order + courier status, computed by the API).
export const stageNames: Record<string, string> = {
  pending: 'Qabul qilindi', confirmed: 'Tasdiqlandi', assigned: 'Kuryer tayinlandi', courier_accepted: 'Kuryer qabul qildi',
  picked_up: 'Kuryerda', on_the_way: 'Yoʻlda', arrived: 'Kuryer yetib keldi', delivered_pending_confirmation: 'Tasdiqlang',
  disputed: 'Koʻrib chiqilmoqda', delivered: 'Yetkazildi', cancelled: 'Bekor qilindi',
};
export const stageBadge: Record<string, string> = {
  pending: 'new', confirmed: 'confirmed', assigned: 'preparing', courier_accepted: 'preparing', picked_up: 'shipped', on_the_way: 'shipped',
  arrived: 'shipped', delivered_pending_confirmation: 'confirmed', disputed: 'cancelled', delivered: 'delivered', cancelled: 'cancelled',
};
/** Ordered steps for the progress timeline. */
export const stageSteps: [string, string][] = [
  ['pending', 'Buyurtma qabul qilindi'], ['confirmed', 'Doʻkon tasdiqladi'], ['courier_accepted', 'Kuryer qabul qildi'],
  ['picked_up', 'Buyurtma kuryerda'], ['on_the_way', 'Yoʻlda'], ['arrived', 'Kuryer yetib keldi'], ['delivered', 'Qabul qilindi'],
];
export function stageIndex(stage: string): number {
  const order = ['pending', 'confirmed', 'assigned', 'courier_accepted', 'picked_up', 'on_the_way', 'arrived', 'delivered_pending_confirmation', 'delivered'];
  const i = order.indexOf(stage === 'disputed' ? 'delivered_pending_confirmation' : stage);
  // Map onto stageSteps (assigned shares the "confirmed" step; pending confirmation shares "arrived").
  return [0, 1, 1, 2, 3, 4, 5, 5, 6][Math.max(0, i)];
}
export const deliveryNames: Record<string, string> = {
  assigned: 'Tayinlandi', accepted: 'Qabul qildi', declined: 'Rad etdi', picked_up: 'Olib ketdi', on_the_way: 'Yoʻlda', arrived: 'Yetib keldi',
  handed_over: 'Topshirdi', confirmed: 'Mijoz tasdiqladi', disputed: 'Eʼtiroz', resolved: 'Admin hal qildi', cancelled: 'Bekor qilindi',
};
export function agoText(seconds: number): string {
  if (seconds < 60) return 'hozirgina';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} daqiqa oldin`;
  return `${Math.floor(seconds / 3600)} soat oldin`;
}
