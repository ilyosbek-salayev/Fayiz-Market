import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { money } from '@fayz/shared';
import type { Category, Product } from '@fayz/shared';
import './style.css';

declare global { interface Window { FayzNative?: { share: (text: string) => void } } }
type Tab = 'home' | 'catalog' | 'cart' | 'orders' | 'profile';
type StoredOrder = { id: number; orderNumber: string; accessToken: string; total: number; status: string };
type OrderDetail = StoredOrder & { createdAt: string; items: { name: string; price: number; quantity: number }[] };
type Profile = { customerName: string; phone: string; address: string };
const API = import.meta.env.VITE_API_URL || (location.pathname.startsWith('/__app/') ? location.origin : 'http://localhost:8787');
const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  let data: any;
  try { data = await response.json(); } catch { throw new Error('Server javobi oʻqilmadi'); }
  if (!response.ok) throw new Error(data.error?.message || `Server xatosi (${response.status})`);
  return data as T;
}
const statusNames: Record<string,string> = { new:'Yangi', confirmed:'Tasdiqlangan', preparing:'Tayyorlanmoqda', shipped:'Yoʻlda', delivered:'Yetkazildi', cancelled:'Bekor qilingan' };
const themes: Record<string,[string,string,string]> = { yellow:['#f6c72d','#fffdf6','#252017'],green:['#3ac29a','#f7fffb','#142c24'],blue:['#75a7f6','#f8fbff','#192b4c'],black:['#303030','#141414','#f8f8f8'] };

function App() {
  const [tab,setTab] = useState<Tab>('home');
  const [products,setProducts] = useState<Product[]>([]);
  const [featured,setFeatured] = useState<Product[]>([]);
  const [categories,setCategories] = useState<Category[]>([]);
  const [settings,setSettings] = useState<Record<string,string>>({});
  const [search,setSearch] = useState(''); const [category,setCategory] = useState(''); const [sort,setSort] = useState('newest');
  const [page,setPage] = useState(1); const [total,setTotal] = useState(0); const [loading,setLoading] = useState(true); const [error,setError] = useState('');
  const [selected,setSelected] = useState<Product|null>(null);
  const [cart,setCart] = useState<Record<string,number>>(() => read('fayz_cart',{}));
  const [cartProducts,setCartProducts] = useState<Record<string,Product>>(() => read('fayz_cart_products',{}));
  const [profile,setProfile] = useState<Profile>(() => read('fayz_profile',{customerName:'',phone:'+998',address:''}));
  const [note,setNote] = useState(''); const [checkout,setCheckout] = useState(false); const [submitting,setSubmitting] = useState(false);
  const [savedOrders,setSavedOrders] = useState<StoredOrder[]>(() => read('fayz_orders',[]));
  const [orders,setOrders] = useState<Record<number,OrderDetail>>({}); const [orderError,setOrderError] = useState('');
  const [confirmation,setConfirmation] = useState('');
  const [theme,setTheme] = useState(() => localStorage.getItem('fayz_theme') || 'yellow');
  useEffect(() => { localStorage.setItem('fayz_cart',JSON.stringify(cart)); },[cart]);
  useEffect(() => { localStorage.setItem('fayz_cart_products',JSON.stringify(cartProducts)); },[cartProducts]);
  useEffect(() => { localStorage.setItem('fayz_profile',JSON.stringify(profile)); },[profile]);
  useEffect(() => { localStorage.setItem('fayz_orders',JSON.stringify(savedOrders)); },[savedOrders]);
  useEffect(() => { localStorage.setItem('fayz_theme',theme); const colors=themes[theme]||themes.yellow; document.documentElement.style.setProperty('--accent',colors[0]); document.documentElement.style.setProperty('--bg',colors[1]); document.documentElement.style.setProperty('--ink',colors[2]); },[theme]);
  const load = useCallback(async (nextPage=1, append=false) => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ page:String(nextPage),limit:'20',sort });
      if (search.trim()) query.set('q',search.trim()); if (category) query.set('category',category);
      const [catalog,cats,config,top] = await Promise.all([
        api<{products:Product[];total:number}>('/products?'+query), api<{categories:Category[]}>('/categories'),
        api<{settings:Record<string,string>}>('/settings'),api<{products:Product[]}>('/products?featured=1&limit=8')
      ]);
      setProducts(old => append ? [...old,...catalog.products] : catalog.products); setTotal(catalog.total); setPage(nextPage);
      setCategories(cats.categories); setSettings(config.settings); setFeatured(top.products);
    } catch(e) { setError((e as Error).message); } finally { setLoading(false); }
  },[search,category,sort]);
  useEffect(() => { const timer=setTimeout(() => load(),search ? 350 : 0); return () => clearTimeout(timer); },[load]);
  useEffect(() => {
    const open = async (slug:string) => { try { const result=await api<{product:Product}>('/products/'+encodeURIComponent(slug)); setSelected(result.product); setTab('catalog'); } catch(e) { setError((e as Error).message); } };
    const initial = location.hash.match(/^#\/p\/([a-z0-9-]+)/)?.[1]; if(initial) void open(initial);
    const handler=(event:Event) => { const slug=(event as CustomEvent<string>).detail; if(slug) void open(slug); };
    window.addEventListener('fayz-product',handler); return () => window.removeEventListener('fayz-product',handler);
  },[]);
  const cartItems = useMemo(() => Object.entries(cart).map(([id,quantity]) => ({ product:cartProducts[id] || products.find(p => p.id===Number(id)),quantity })).filter((x):x is {product:Product;quantity:number} => !!x.product),[cart,cartProducts,products]);
  const cartTotal = cartItems.reduce((sum,x) => sum+x.product.price*x.quantity,0);
  function quantity(product:Product, delta:number) { setCartProducts(old => ({...old,[product.id]:product})); setCart(old => { const next={...old}; const count=Math.min(product.stock,Math.max(0,(next[product.id]||0)+delta)); if(count) next[product.id]=count; else delete next[product.id]; return next; }); }
  const refreshOrders = useCallback(async () => { setOrderError(''); try { const result=await Promise.all(savedOrders.map(async saved => (await api<{order:OrderDetail}>(`/orders/${saved.id}`,{headers:{Authorization:`Order ${saved.accessToken}`}})).order)); setOrders(Object.fromEntries(result.map(order => [order.id,order]))); } catch(e) { setOrderError((e as Error).message); } },[savedOrders]);
  useEffect(() => { if(tab==='orders' && savedOrders.length) void refreshOrders(); },[tab,savedOrders.length]);
  async function submit() {
    if(submitting) return;
    if(profile.customerName.trim().length<2 || !/^\+998\d{9}$/.test(profile.phone) || profile.address.trim().length<5) { alert('Ism, +998 formatidagi telefon va manzilni toʻliq kiriting.'); return; }
    if(!cartItems.length) return;
    setSubmitting(true);
    try {
      const latest=await Promise.all(cartItems.map(x => api<{product:Product}>('/products/'+encodeURIComponent(x.product.slug)).then(r => r.product)));
      setCartProducts(Object.fromEntries(latest.map(p => [p.id,p])));
      if(latest.some((p,i) => p.price!==cartItems[i].product.price || p.stock<cartItems[i].quantity)) { setCheckout(false); alert('Narx yoki qoldiq oʻzgardi. Savatni qayta tekshiring.'); await load(); return; }
      const result=await api<{order:StoredOrder}>('/orders',{method:'POST',body:JSON.stringify({customerName:profile.customerName.trim(),phone:profile.phone,address:profile.address.trim(),note,items:cartItems.map(x => ({productId:x.product.id,quantity:x.quantity}))})});
      setSavedOrders(old => [result.order,...old]); setCart({}); setCartProducts({}); setCheckout(false); setConfirmation(result.order.orderNumber); setTab('orders');
    } catch(e) { alert('Buyurtma yuborilmadi: '+(e as Error).message); } finally { setSubmitting(false); }
  }
  const productCard=(p:Product) => <button key={p.id} className="product" onClick={() => setSelected(p)}><div className="photo">{p.images[0] ? <img src={p.images[0]} alt=""/> : <span>Fayz Market</span>}</div><strong>{p.name}</strong><small>{p.categoryName}</small><b>{money(p.price)}</b><small>{p.stock ? `Qoldiq: ${p.stock}` : 'Sotuvda yoʻq'}</small></button>;
  const profileFields=<><label>Ism<input value={profile.customerName} onChange={e => setProfile({...profile,customerName:e.target.value})} autoComplete="name" /></label><label>Telefon<input type="tel" value={profile.phone} onChange={e => setProfile({...profile,phone:e.target.value})} placeholder="+998901234567" autoComplete="tel" /></label><label>Yetkazib berish manzili<textarea value={profile.address} onChange={e => setProfile({...profile,address:e.target.value})} autoComplete="street-address" /></label></>;
  return <div className="app"><header><strong>Fayz Market</strong><span>Aksessuarlar doʻkoni</span></header><main>
    {selected ? <section><button className="ghost" onClick={() => setSelected(null)}>← Orqaga</button><div className="gallery">{selected.images.length ? selected.images.map((url,i) => <img key={i} src={url} alt={`${selected.name} ${i+1}`}/>) : <div className="photo">Rasm mavjud emas</div>}</div><h1>{selected.name}</h1><p className="price">{money(selected.price)}</p><p>{selected.stock ? `${selected.stock} dona mavjud` : 'Hozir sotuvda yoʻq'}</p><p>{selected.description}</p><button disabled={!selected.stock} onClick={() => {quantity(selected,1);alert('Savatga qoʻshildi');}}>Savatga qoʻshish</button><button className="ghost" onClick={() => {const text=`Fayz Market: ${selected.name} — ${API}/p/${selected.slug}`; if(window.FayzNative) window.FayzNative.share(text); else navigator.share?.({text}).catch(() => navigator.clipboard?.writeText(text));}}>Ulashish</button></section>
    : (tab==='home'||tab==='catalog') ? <section>{tab==='home' && <><div className="hero"><h1>{settings.banner_title||'Fayz Market'}</h1><p>{settings.banner_subtitle||'Siz uchun aksessuarlar'}</p></div>{featured.length>0 && <><h2>Tanlangan mahsulotlar</h2><div className="featured">{featured.map(productCard)}</div></>}</>}<label className="search">Mahsulot qidirish<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nomi yoki tavsifi"/></label><div className="chips"><button className={!category?'active':''} onClick={() => setCategory('')}>Barchasi</button>{categories.map(c => <button key={c.id} className={category===c.slug?'active':''} onClick={() => setCategory(c.slug)}>{c.name}</button>)}</div><div className="chips"><button className={sort==='newest'?'active':''} onClick={() => setSort('newest')}>Yangi</button><button className={sort==='price_asc'?'active':''} onClick={() => setSort('price_asc')}>Arzon</button><button className={sort==='price_desc'?'active':''} onClick={() => setSort('price_desc')}>Qimmat</button><button className={sort==='name'?'active':''} onClick={() => setSort('name')}>Nom</button></div><h2>Mahsulotlar ({total})</h2>{error && <div className="error">{error}<button onClick={() => load()}>Qayta urinish</button></div>}{loading && <p>Yuklanmoqda...</p>}{!loading && !error && !products.length && <p>Mahsulot topilmadi</p>}<div className="grid">{products.map(productCard)}</div>{products.length<total && <button onClick={() => load(page+1,true)} disabled={loading}>Yana koʻrish</button>}</section>
    : tab==='cart' ? <section><h1>Savat</h1>{cartItems.length ? cartItems.map(({product,quantity:count}) => <div className="cart-row" key={product.id}>{product.images[0] && <img src={product.images[0]} alt=""/>}<div><strong>{product.name}</strong><p>{money(product.price*count)}</p><div className="quantity"><button onClick={() => quantity(product,-1)}>−</button><b>{count}</b><button onClick={() => quantity(product,1)} disabled={count>=product.stock}>+</button></div></div></div>) : <p>Savat boʻsh</p>}{cartItems.length>0 && <><h2>Jami: {money(cartTotal)}</h2><button onClick={() => setCheckout(true)}>Buyurtma berish</button></>}</section>
    : tab==='orders' ? <section><h1>Buyurtmalarim</h1>{confirmation && <div className="success">Buyurtma qabul qilindi: {confirmation}</div>}{orderError && <div className="error">{orderError}<button onClick={refreshOrders}>Qayta urinish</button></div>}<button className="ghost" onClick={refreshOrders}>Yangilash</button>{!savedOrders.length && <p>Hali buyurtma yoʻq</p>}{savedOrders.map(saved => {const order=orders[saved.id]; return <article key={saved.id}><strong>{saved.orderNumber}</strong><p>Holat: {order?statusNames[order.status]:'Yuklanmoqda...'}</p>{order && <><p>{money(order.total)} · {order.createdAt}</p>{order.items.map((item,i) => <p key={i}>{item.name} × {item.quantity}</p>)}</>}</article>;})}</section>
    : <section><h1>Profil</h1><p>Maʼlumotlar faqat shu telefonda saqlanadi.</p>{profileFields}<h2>Koʻrinish</h2><div className="chips">{Object.keys(themes).map(key => <button key={key} className={theme===key?'active':''} onClick={() => setTheme(key)}>{({yellow:'Sariq',green:'Yashil',blue:'Koʻk',black:'Qora'} as Record<string,string>)[key]}</button>)}</div><h2>Aloqa</h2><p>{settings.contact_phone||'Aloqa raqami kiritilmagan'}</p><p>{settings.delivery_info}</p></section>}
  </main><nav>{([['home','Bosh sahifa'],['catalog','Katalog'],['cart',`Savat (${Object.values(cart).reduce((a,b)=>a+b,0)})`],['orders','Buyurtmalar'],['profile','Profil']] as [Tab,string][]).map(([key,label]) => <button key={key} className={tab===key?'current':''} onClick={() => {setSelected(null);setTab(key);}}>{label}</button>)}</nav>
  {checkout && <div className="overlay"><div className="sheet"><h2>Buyurtmani rasmiylashtirish</h2><p className="price">Jami: {money(cartTotal)}</p>{profileFields}<label>Izoh<textarea value={note} onChange={e => setNote(e.target.value)} /></label><button onClick={submit} disabled={submitting}>{submitting?'Yuborilmoqda...':'Buyurtmani yuborish'}</button><button className="ghost" onClick={() => setCheckout(false)}>Bekor qilish</button></div></div>}</div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
