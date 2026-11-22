import { z } from 'zod';

export const orderStatuses = ['new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'] as const;
export const paymentStatuses = ['pending', 'received', 'refunded'] as const;
export const productSchema = z.object({
  name: z.string().trim().min(2).max(160), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(4000).default(''), categoryId: z.number().int().positive(),
  price: z.number().int().nonnegative(), stock: z.number().int().nonnegative(),
  active: z.boolean().default(true), featured: z.boolean().default(false),
  images: z.array(z.string().url()).max(8).default([])
});
export const categorySchema = z.object({ name: z.string().trim().min(2).max(100), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });
export const checkoutSchema = z.object({
  customerName: z.string().trim().min(2).max(120), phone: z.string().regex(/^\+998\d{9}$/),
  address: z.string().trim().min(5).max(500), note: z.string().max(500).default(''),
  items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(99) })).min(1).max(50)
});
export const adminLoginSchema = z.object({ email: z.string().email(), password: z.string().min(10) });
export const statusSchema = z.object({ status: z.enum(orderStatuses) });
export const paymentSchema = z.object({ amount: z.number().int().positive(), method: z.enum(['cash', 'bank_transfer', 'card_terminal']), reference: z.string().max(120).default(''), note: z.string().max(500).default('') });

export type ProductInput = z.infer<typeof productSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type Product = ProductInput & { id: number; categoryName: string; createdAt: string };
export type Category = z.infer<typeof categorySchema> & { id: number };
export type CartItem = { product: Product; quantity: number };
export type Order = { id: number; orderNumber: string; customerName: string; phone: string; address: string; note: string; status: typeof orderStatuses[number]; total: number; createdAt: string; items: { productId: number; name: string; price: number; quantity: number }[] };

export function money(amount: number): string { return new Intl.NumberFormat('uz-UZ').format(amount) + ' soʻm'; }
export function cartTotal(items: CartItem[]): number { return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0); }
