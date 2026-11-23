import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.TEST_API_URL || 'http://127.0.0.1:8787';
const publicUrl = process.env.PHONE_API_URL || base;
const vars = await readFile(resolve('apps/api/.dev.vars'), 'utf8');
const secret = vars.match(/^BOOTSTRAP_SECRET\s*=\s*["']?([^"'\r\n]+)["']?/m)?.[1];
if (!secret) throw new Error('apps/api/.dev.vars ichida BOOTSTRAP_SECRET kerak');
async function call(path, method='GET', body, token, extra={}) {
  const response = await fetch(base+path,{method,headers:{...(body instanceof Uint8Array?{'Content-Type':'image/png'}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{...extra})},body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)});
  const data = await response.json();
  if(!response.ok) throw new Error(`${path}: ${data.error?.message || response.status}`);
  return data;
}
const email = `phone-test-${Date.now()}@example.invalid`;
const password = randomBytes(18).toString('base64url');
await call('/health');
await call('/admin/bootstrap','POST',{email,password},undefined,{'X-Bootstrap-Secret':secret});
const {token} = await call('/admin/login','POST',{email,password});
const {id:categoryId} = await call('/admin/categories','POST',{name:'Telefon sinovi',slug:'telefon-sinovi'},token);
const icon = new Uint8Array(await readFile(resolve('apps/android/customer/src/main/res/drawable-nodpi/launcher.png')));
const {url:imageUrl} = await call('/admin/images','POST',icon,token);
const products = [
  ['Sinov: Telefon gʻilofi','sinov-telefon-gilofi',89000],
  ['Sinov: Qoʻl soati','sinov-qol-soati',245000],
  ['Sinov: Hamyon','sinov-hamyon',159000]
];
for (const [name,slug,price] of products) await call('/admin/products','POST',{name,slug,description:'Lokal telefon sinovi uchun mahsulot. Haqiqiy savdo katalogi emas.',categoryId,price,stock:5,active:true,featured:true,images:[imageUrl]},token);
const catalog = await call('/products?q=Sinov');
if(catalog.products.length!==3) throw new Error('Sinov katalogida 3 mahsulot topilmadi');
await mkdir(resolve('dist'),{recursive:true});
const file=resolve('dist/phone-test-credentials.txt');
await writeFile(file,`Fayz Market lokal telefon sinovi\nAPI: ${publicUrl}\nAdmin email: ${email}\nAdmin parol: ${password}\nBu hisob faqat lokal D1 bazasida. Production uchun ishlatmang.\n`,{mode:0o600});
console.log(`Lokal katalog: ${catalog.products.length} mahsulot. Kirish maʼlumotlari: ${file}`);
