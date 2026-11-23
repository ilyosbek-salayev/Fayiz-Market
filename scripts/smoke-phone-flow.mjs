import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const credentials = await readFile(resolve('dist/phone-test-credentials.txt'),'utf8');
const email = credentials.match(/^Admin email: (.+)$/m)?.[1];
const password = credentials.match(/^Admin parol: (.+)$/m)?.[1];
assert.ok(email && password, 'Lokal admin kirish maʼlumotlari topilmadi');
const base = process.env.TEST_API_URL || 'http://127.0.0.1:8787';
async function call(path, method='GET', body, authorization) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  assert.ok(response.ok,`${path}: ${data.error?.message || response.status}`);
  return data;
}
const {token}=await call('/admin/login','POST',{email,password});
const {products}=await call('/products?q=Sinov');
assert.equal(products.length,3,'Katalogdagi sinov mahsulotlari');
const product=products[0];
const detail=await call('/products/'+product.slug);
assert.equal(detail.product.id,product.id,'Mahsulot tafsiloti');
const cartTotal=product.price*1;
const {order}=await call('/orders','POST',{customerName:'Sinov Xaridor',phone:'+998901234567',address:'Toshkent, lokal telefon sinovi',note:'Avtomatik API sinovi',items:[{productId:product.id,quantity:1}]});
assert.equal(order.total,cartTotal,'Savatcha va buyurtma summasi');
const {order:customerOrder}=await call(`/orders/${order.id}`,'GET',undefined,`Order ${order.accessToken}`);
assert.equal(customerOrder.orderNumber,order.orderNumber,'Mijoz buyurtma tarixi');
const {orders}=await call('/admin/orders','GET',undefined,`Bearer ${token}`);
assert.ok(orders.some(item=>item.id===order.id),'Admin buyurtma roʻyxati');
await call(`/admin/orders/${order.id}/status`,'PATCH',{status:'confirmed'},`Bearer ${token}`);
const {order:updated}=await call(`/orders/${order.id}`,'GET',undefined,`Order ${order.accessToken}`);
assert.equal(updated.status,'confirmed','Admin holat oʻzgarishi mijozga koʻrinadi');
const amount=Math.min(1000,order.total);
await call(`/admin/orders/${order.id}/payments`,'POST',{amount,method:'cash',reference:'LOCAL-SMOKE',note:'Faqat lokal sinov'},`Bearer ${token}`);
const report=await call('/admin/reports/summary','GET',undefined,`Bearer ${token}`);
assert.ok(report.payments.received_total>=amount,'Toʻlov hisobotga tushdi');
console.log(`Lokal API oqimi oʻtdi: login, katalog, savat hisobi, buyurtma ${order.orderNumber}, admin holati va toʻlov hisoboti.`);
