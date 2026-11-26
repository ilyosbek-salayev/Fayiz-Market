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
// ---------- Variants and characteristics (all optional: a simple product sends none of them) ----------
const label = (max: number) => z.string().trim().min(1).max(max);
export const productOptionSchema = z.object({ name: label(40), values: z.array(label(40)).min(1).max(30) });
export const productAttributeSchema = z.object({ name: label(60), value: label(200) });
export const productVariantSchema = z.object({
  id: z.number().int().positive().optional(),
  options: z.record(z.string(), z.string().trim().min(1).max(40)),
  price: z.number().int().nonnegative(), comparePrice: z.number().int().nonnegative().default(0),
  stock: z.number().int().nonnegative().max(1_000_000).default(0),
  image: z.union([z.string().url(), z.literal('')]).default(''), active: z.boolean().default(true),
});
/** Fields an older admin app does not send are left untouched on update (never wiped). */
export const productExtrasSchema = z.object({
  comparePrice: z.number().int().nonnegative().optional(),
  options: z.array(productOptionSchema).max(3).optional(),
  attributes: z.array(productAttributeSchema).max(30).optional(),
  variants: z.array(productVariantSchema).max(100).optional(),
});
export type ProductOption = z.infer<typeof productOptionSchema>;
export type ProductAttribute = z.infer<typeof productAttributeSchema>;
export type ProductVariant = { id: number; options: Record<string, string>; label: string; price: number; comparePrice: number; stock: number; image: string; active: boolean };
/** «Qora · 128 GB» — option values in the product's axis order. */
export function variantLabel(options: Record<string, string>, axes?: { name: string }[]): string {
  const keys = axes?.length ? axes.map(a => a.name).filter(k => k in options) : Object.keys(options);
  return keys.map(k => options[k]).filter(Boolean).join(' · ');
}
export const categorySchema = z.object({ name: z.string().trim().min(2).max(100), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });
export const checkoutSchema = z.object({
  customerName: z.string().trim().min(2).max(120), phone: z.string().regex(/^\+998\d{9}$/),
  address: z.string().trim().min(5).max(500), note: z.string().max(500).default(''),
  items: z.array(z.object({ productId: z.number().int().positive(), variantId: z.number().int().positive().optional(), quantity: z.number().int().min(1).max(99) })).min(1).max(50)
});
// Email is trimmed and lower-cased (phone keyboards add a trailing space or a capital letter); the password is exact.
export const adminLoginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(10) });
export const statusSchema = z.object({ status: z.enum(orderStatuses) });
export const paymentSchema = z.object({ amount: z.number().int().positive(), method: z.enum(['cash', 'bank_transfer', 'card_terminal']), reference: z.string().max(120).default(''), note: z.string().max(500).default('') });

export type ProductInput = z.infer<typeof productSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type Product = ProductInput & {
  id: number; categoryName: string; createdAt: string;
  /** V1 1.2.2+: absent on older servers. */
  comparePrice?: number; options?: ProductOption[]; attributes?: ProductAttribute[];
  variantCount?: number; priceFrom?: number; priceTo?: number; variants?: ProductVariant[];
};
export type Category = z.infer<typeof categorySchema> & { id: number };
export type CartItem = { product: Product; quantity: number };
export type Order = { id: number; orderNumber: string; customerName: string; phone: string; address: string; note: string; status: typeof orderStatuses[number]; total: number; createdAt: string; items: { productId: number; variantId?: number | null; variant?: string; name: string; price: number; quantity: number }[] };

/** «1 000 000 soʻm»: space-grouped thousands on every device (Intl uz-UZ prints commas in some WebViews). */
export function money(amount: number): string {
  const n = Math.round(Number(amount) || 0), digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${n < 0 ? '−' : ''}${digits} soʻm`;
}
export function cartTotal(items: CartItem[]): number { return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0); }
