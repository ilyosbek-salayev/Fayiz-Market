// Catalogue: product rows with variant aggregates, variant validation and saving, and related products.
// Stock of a product WITH variants lives on its variants (see migration 0009); simple products are unchanged.
import { variantLabel, type ProductAttribute, type ProductOption } from '@fayz/shared';
import { fail } from './lib';

type Db = D1Database;
type VariantRow = { id: number; product_id: number; options: string; option_key: string; price: number; compare_price: number; stock: number; image_url: string; active: number; position: number };
export type VariantInput = { id?: number; options: Record<string, string>; price: number; comparePrice: number; stock: number; image: string; active: boolean };

const parseJson = <T,>(raw: unknown, fallback: T): T => { try { const v = JSON.parse(String(raw ?? '')); return (v ?? fallback) as T; } catch { return fallback; } };

/** Product row + category name + images + aggregates over its ACTIVE variants. */
export const productSelect = `SELECT p.*, c.name AS category_name,
  (SELECT json_group_array(url) FROM (SELECT url FROM product_images WHERE product_id=p.id ORDER BY position)) AS images,
  (SELECT COUNT(*) FROM product_variants v WHERE v.product_id=p.id AND v.active=1) AS variant_count,
  (SELECT MIN(price) FROM product_variants v WHERE v.product_id=p.id AND v.active=1) AS variant_min,
  (SELECT MAX(price) FROM product_variants v WHERE v.product_id=p.id AND v.active=1) AS variant_max,
  (SELECT COALESCE(SUM(stock),0) FROM product_variants v WHERE v.product_id=p.id AND v.active=1) AS variant_stock
  FROM products p JOIN categories c ON c.id=p.category_id`;
/** SQL expression for "units a customer can buy" (used in filters and reports). */
export const availableStockSql = `(CASE WHEN EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.active=1) THEN (SELECT COALESCE(SUM(stock),0) FROM product_variants v WHERE v.product_id=p.id AND v.active=1) ELSE p.stock END)`;

export function rowProduct(row: Record<string, unknown>) {
  const variantCount = Number(row.variant_count || 0);
  return {
    id: row.id, name: row.name, slug: row.slug, description: row.description, categoryId: row.category_id,
    categoryName: row.category_name, price: variantCount ? Number(row.variant_min) : row.price,
    stock: variantCount ? Number(row.variant_stock) : row.stock, active: Boolean(row.active),
    featured: Boolean(row.featured), createdAt: row.created_at,
    images: parseJson<string[]>(row.images, []),
    comparePrice: Number(row.compare_price || 0),
    options: parseJson<ProductOption[]>(row.options, []), attributes: parseJson<ProductAttribute[]>(row.attributes, []),
    variantCount, priceFrom: variantCount ? Number(row.variant_min) : Number(row.price), priceTo: variantCount ? Number(row.variant_max) : Number(row.price),
  };
}
const variantView = (v: VariantRow, axes: ProductOption[]) => {
  const options = parseJson<Record<string, string>>(v.options, {});
  return { id: v.id, options, label: variantLabel(options, axes), price: v.price, comparePrice: v.compare_price, stock: v.stock, image: v.image_url, active: v.active === 1 };
};
/** Adds `variants` to a product view. Customers see active variants and only the option values they can pick. */
export async function withVariants<T extends { id: unknown; options: ProductOption[] }>(db: Db, product: T, includeInactive = false) {
  const rows = (await db.prepare(`SELECT * FROM product_variants WHERE product_id=? ${includeInactive ? '' : 'AND active=1'} ORDER BY position,id`).bind(product.id).all<VariantRow>()).results;
  const variants = rows.map(v => variantView(v, product.options));
  if (includeInactive || !variants.length) return { ...product, variants };
  const options = product.options.map(axis => ({ ...axis, values: axis.values.filter(value => variants.some(v => v.options[axis.name] === value)) })).filter(axis => axis.values.length);
  return { ...product, options, variants };
}

const keyPart = (s: string) => s.trim().toLocaleLowerCase('uz').replace(/\s+/g, ' ');
/** Normalised, ordered combination key: "rang=qora|xotira=128 gb". */
export const optionKey = (options: Record<string, string>, axes: ProductOption[]) => axes.map(a => `${keyPart(a.name)}=${keyPart(options[a.name] || '')}`).join('|');

/** Validates axes + variants together; throws a 400 with a message the admin can act on. */
export function checkVariants(axes: ProductOption[], variants: VariantInput[]) {
  const names = axes.map(a => keyPart(a.name));
  if (new Set(names).size !== names.length) fail(400, 'VARIANT_OPTIONS', 'Variant turlari takrorlanmasin (masalan, ikki marta «Rang»)');
  for (const axis of axes) { const values = axis.values.map(keyPart); if (new Set(values).size !== values.length) fail(400, 'VARIANT_OPTIONS', `«${axis.name}» qiymatlari takrorlanmasin`); }
  if (!axes.length && variants.length) fail(400, 'VARIANT_OPTIONS', 'Variantlar uchun avval variant turini (masalan, Rang) qoʻshing');
  const keys = new Set<string>();
  for (const v of variants) {
    const given = Object.keys(v.options);
    if (given.length !== axes.length || axes.some(a => !(a.name in v.options))) fail(400, 'VARIANT_OPTIONS', 'Har bir variantda barcha variant turlari tanlangan boʻlishi kerak');
    for (const a of axes) if (!a.values.some(x => keyPart(x) === keyPart(v.options[a.name]))) fail(400, 'VARIANT_OPTIONS', `«${v.options[a.name]}» — «${a.name}» qiymatlari roʻyxatida yoʻq`);
    const key = optionKey(v.options, axes);
    if (keys.has(key)) fail(409, 'VARIANT_DUPLICATE', `«${variantLabel(v.options, axes)}» varianti ikki marta kiritilgan`);
    keys.add(key);
    if (v.comparePrice && v.comparePrice <= v.price) fail(400, 'COMPARE_PRICE', 'Chegirmagacha narx joriy narxdan katta boʻlishi kerak');
  }
}

/**
 * Upserts the variants of one product (matched by id, then by option combination so order history keeps its
 * variant ids). Variants left out are deleted — or, when an order already references them, switched off.
 * Existing variants keep their stock: it changes only through orders and audited stock adjustments.
 */
export async function saveVariants(db: Db, productId: number, axes: ProductOption[], variants: VariantInput[]) {
  checkVariants(axes, variants);
  const existing = (await db.prepare('SELECT * FROM product_variants WHERE product_id=?').bind(productId).all<VariantRow>()).results;
  const used = new Set((await db.prepare('SELECT DISTINCT variant_id AS id FROM order_items WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id=?)').bind(productId).all<{ id: number }>()).results.map(r => r.id));
  const statements: D1PreparedStatement[] = []; const kept = new Set<number>();
  // Old rows whose combination changes could collide with a new key mid-batch: give them a temporary key first.
  for (const row of existing) statements.push(db.prepare("UPDATE product_variants SET option_key='~'||id WHERE id=?").bind(row.id));
  variants.forEach((v, position) => {
    const key = optionKey(v.options, axes);
    const ordered = Object.fromEntries(axes.map(a => [a.name, a.values.find(x => keyPart(x) === keyPart(v.options[a.name]))!]));
    const match = existing.find(r => r.id === v.id && !kept.has(r.id)) || existing.find(r => r.option_key === key && !kept.has(r.id));
    if (match) {
      kept.add(match.id);
      statements.push(db.prepare('UPDATE product_variants SET options=?,option_key=?,price=?,compare_price=?,image_url=?,active=?,position=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(ordered), key, v.price, v.comparePrice, v.image, Number(v.active), position, match.id));
    } else {
      statements.push(db.prepare('INSERT INTO product_variants(product_id,options,option_key,price,compare_price,stock,image_url,active,position) VALUES(?,?,?,?,?,?,?,?,?)').bind(productId, JSON.stringify(ordered), key, v.price, v.comparePrice, v.stock, v.image, Number(v.active), position));
    }
  });
  for (const row of existing) {
    if (kept.has(row.id)) continue;
    statements.push(used.has(row.id)
      ? db.prepare("UPDATE product_variants SET active=0,option_key='~'||id,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id)
      : db.prepare('DELETE FROM product_variants WHERE id=?').bind(row.id));
  }
  // Sorting and old apps read products.price: keep it at the lowest active variant price.
  statements.push(db.prepare('UPDATE products SET price=COALESCE((SELECT MIN(price) FROM product_variants WHERE product_id=? AND active=1),price),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(productId, productId));
  return statements;
}

/** «Sizga ham yoqishi mumkin»: same category first, then shared characteristics, then featured — in stock only. */
export async function relatedProducts(db: Db, product: { id: number; categoryId: number; attributes: ProductAttribute[] }, limit = 8) {
  const rows = (await db.prepare(`${productSelect} WHERE p.active=1 AND p.id<>? AND ${availableStockSql}>0 ORDER BY (p.category_id=?) DESC, p.featured DESC, p.id DESC LIMIT 40`).bind(product.id, product.categoryId).all()).results.map(rowProduct);
  const mine = new Set(product.attributes.map(a => `${keyPart(a.name)}=${keyPart(a.value)}`));
  const score = (p: ReturnType<typeof rowProduct>) => (p.categoryId === product.categoryId ? 100 : 0) + p.attributes.filter(a => mine.has(`${keyPart(a.name)}=${keyPart(a.value)}`)).length * 10 + (p.featured ? 1 : 0);
  return rows.map((p, i) => ({ p, s: score(p), i })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, limit).map(x => x.p);
}
