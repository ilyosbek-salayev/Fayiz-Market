import { describe, expect, it } from 'vitest';
import { cartTotal, checkoutSchema, productSchema } from './index';

describe('checkout validation', () => {
  it('requires an Uzbek phone and at least one item', () => {
    const base = { customerName: 'Ali Valiyev', phone: '+998901234567', address: 'Toshkent, Yunusobod 1', items: [{ productId: 1, quantity: 2 }] };
    expect(checkoutSchema.safeParse(base).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...base, phone: '901234567' }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, items: [{ productId: 1, quantity: 0 }] }).success).toBe(false);
  });
  it('rejects negative prices and stock', () => {
    const product = { name: 'Sumka', slug: 'sumka', categoryId: 1, price: 1000, stock: 2 };
    expect(productSchema.safeParse(product).success).toBe(true);
    expect(productSchema.safeParse({ ...product, price: -1 }).success).toBe(false);
    expect(productSchema.safeParse({ ...product, stock: -1 }).success).toBe(false);
  });
  it('calculates cart totals in integer soʻm', () => {
    expect(cartTotal([{ product: { price: 120000 } as any, quantity: 2 }, { product: { price: 35000 } as any, quantity: 3 }])).toBe(345000);
  });
});
