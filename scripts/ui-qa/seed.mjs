// QA-only seed for an isolated local Worker (port 8788). Not shipped, not real catalog data.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
const base = process.env.QA_API || 'http://127.0.0.1:8788';
const email = 'qa-owner@example.invalid', password = 'QaLocalPassword123!';
async function call(path, method = 'GET', body, token, extra = {}) {
  const binary = body instanceof Uint8Array || Buffer.isBuffer(body);
  const r = await fetch(base + path, { method, headers: { 'Content-Type': binary ? 'image/png' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: body === undefined ? undefined : binary ? body : JSON.stringify(body) });
  const data = await r.json(); if (!r.ok) throw new Error(path + ': ' + JSON.stringify(data)); return data;
}
const img = (w, h, color) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="rgba(255,255,255,.55)"/><text x="${w / 2}" y="${h - 30}" font-size="28" text-anchor="middle" fill="#fff" font-family="Arial">QA ${w}x${h}</text></svg>`), top: 0, left: 0 }]).png().toBuffer();
await call('/admin/bootstrap', 'POST', { email, password }, undefined, { 'X-Bootstrap-Secret': 'qa-local-secret-only' });
const { token } = await call('/admin/login', 'POST', { email, password });
const cats = {};
for (const [name, slug] of [['Soatlar', 'soatlar'], ['Sumkalar', 'sumkalar'], ['Telefon aksessuarlari', 'telefon-aksessuarlari'], ['Koʻzoynaklar', 'kozoynaklar'], ['Taqinchoqlar', 'taqinchoqlar']]) cats[slug] = (await call('/admin/categories', 'POST', { name, slug }, token)).id;
const up = async (w, h, c) => (await call('/admin/images', 'POST', await img(w, h, c), token)).url;
const products = [
  ['QA: Klassik qoʻl soati', 'qa-klassik-soat', 'soatlar', 245000, 5, true, [await up(800, 800, '#8a6d3b'), await up(800, 800, '#5b4a2e')]],
  ['QA: Juda uzun nomli charm ayollar sumkasi, qoʻlda tikilgan, ikki boʻlimli', 'qa-uzun-nomli-sumka', 'sumkalar', 1289000, 2, true, [await up(1200, 700, '#7d3c3c')]],
  ['QA: Telefon gʻilofi', 'qa-telefon-gilofi', 'telefon-aksessuarlari', 89000, 12, true, [await up(600, 1000, '#2f5d7c')]],
  ['QA: Rasmsiz mahsulot', 'qa-rasmsiz', 'kozoynaklar', 159000, 7, false, []],
  ['QA: Sotuvda yoʻq bilaguzuk', 'qa-tugagan', 'taqinchoqlar', 99000, 0, false, [await up(800, 800, '#b08d57')]],
  ['QA: Quyoshdan saqlovchi koʻzoynak', 'qa-kozoynak', 'kozoynaklar', 320000, 3, true, [await up(900, 900, '#3c3c3c')]],
  ['QA: Simsiz quloqchin', 'qa-quloqchin', 'telefon-aksessuarlari', 410000, 9, false, [await up(800, 800, '#41566b')]],
];
for (const [name, slug, cat, price, stock, featured, images] of products) await call('/admin/products', 'POST', { name, slug, description: 'Vizual QA uchun lokal sinov mahsuloti. Haqiqiy katalog emas. Uzun tavsif matni qatorlar oraligʻi va oʻqilishini tekshirish uchun yozilgan.', categoryId: cats[cat], price, stock, active: true, featured, images }, token);
await call('/admin/settings', 'PUT', { contact_phone: '+998 90 123 45 67', delivery_info: 'Toshkent boʻylab 1–2 kun ichida yetkaziladi. Viloyatlarga pochta orqali.', banner_title: 'Sevimli aksessuarlaringiz shu yerda', banner_subtitle: 'Fayz Market bilan qulay xarid qiling' }, token);
const order = await call('/orders', 'POST', { customerName: 'QA Xaridor', phone: '+998901234567', address: 'Toshkent shahri, Yunusobod tumani, 4-mavze, 12-uy, 45-xonadon (uzun manzil sinovi)', note: 'QA', items: [{ productId: 1, quantity: 1 }, { productId: 3, quantity: 2 }] });
await call(`/admin/orders/${order.order.id}/status`, 'PATCH', { status: 'confirmed' }, token);
await call(`/admin/orders/${order.order.id}/payments`, 'POST', { amount: 100000, method: 'cash', reference: '', note: '' }, token);
await writeFile(new URL('./qa-order.json', import.meta.url), JSON.stringify(order.order));
console.log('seeded', order.order.orderNumber);
