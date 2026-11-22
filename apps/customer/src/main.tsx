import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { money } from '@fayz/shared';
import type { Category, Product } from '@fayz/shared';
import { BrandMark, Icon } from '../../../packages/ui/src/Icon';
import { formatDateTime, friendlyError, isNetworkFailure, nativeDebug, nativeReload, openApiSettings, paintSystemBars } from '../../../packages/ui/src/format';
import { EmptyState, Field, ProductCard, ProductImage, ProductSkeleton, SectionHeader, Sheet, Toast, revealOnFocus } from './components';
import '../../../packages/ui/src/tokens.css';
import './style.css';

declare global { interface Window { FayzNative?: { share: (text: string) => void; isDebug?: () => boolean; openApiSettings?: () => void; reload?: () => void; setSystemBars?: (color: string, light: boolean) => void } } }
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
const themes: Record<string,{ label: string; swatch: [string,string] }> = { yellow:{label:'Sariq',swatch:['#FFCC29','#FFFFFF']}, green:{label:'Yashil',swatch:['#2DBE7E','#FFFFFF']}, blue:{label:'Koʻk',swatch:['#2F6FEB','#FFFFFF']}, black:{label:'Qora',swatch:['#1E1E1B','#FFCC29']} };
const sorts: [string,string][] = [['newest','Yangi'],['price_asc','Arzonroq'],['price_desc','Qimmatroq'],['name','Nomi boʻyicha']];
const CHECKOUT_RULES = 'Ism, +998 formatidagi telefon va manzilni toʻliq kiriting.';

function App() {
  const [tab,setTab] = useState<Tab>('home');
  const [products,setProducts] = useState<Product[]>([]);
  const [featured,setFeatured] = useState<Product[]>([]);
  const [categories,setCategories] = useState<Category[]>([]);
  const [settings,setSettings] = useState<Record<string,string>>({});
  const [search,setSearch] = useState(''); const [category,setCategory] = useState(''); const [sort,setSort] = useState('newest');
  const [page,setPage] = useState(1); const [total,setTotal] = useState(0); const [loading,setLoading] = useState(true); const [error,setError] = useState(''); const [offline,setOffline] = useState(false);
  const [selected,setSelected] = useState<Product|null>(null);
  const [cart,setCart] = useState<Record<string,number>>(() => read('fayz_cart',{}));
  const [cartProducts,setCartProducts] = useState<Record<string,Product>>(() => read('fayz_cart_products',{}));
  const [profile,setProfile] = useState<Profile>(() => read('fayz_profile',{customerName:'',phone:'+998',address:''}));
  const [note,setNote] = useState(''); const [checkout,setCheckout] = useState(false); const [submitting,setSubmitting] = useState(false);
  const [savedOrders,setSavedOrders] = useState<StoredOrder[]>(() => read('fayz_orders',[]));
  const [orders,setOrders] = useState<Record<number,OrderDetail>>({}); const [orderError,setOrderError] = useState(''); const [ordersLoading,setOrdersLoading] = useState(false);
  const [confirmation,setConfirmation] = useState('');
  const [theme,setTheme] = useState(() => localStorage.getItem('fayz_theme') || 'yellow');
  // UI-only state: in-app feedback that replaces the former native alert() dialogs.
  const [toast,setToast] = useState<{message:string;action?:string;onAction?:()=>void}|null>(null);
  const [checkoutError,setCheckoutError] = useState(''); const [attempted,setAttempted] = useState(false); const [cartNotice,setCartNotice] = useState('');
  const searchRef = useRef<HTMLInputElement>(null); const [focusSearch,setFocusSearch] = useState(false);
  const debug = useMemo(nativeDebug,[]);
  useEffect(() => { localStorage.setItem('fayz_cart',JSON.stringify(cart)); },[cart]);
  useEffect(() => { localStorage.setItem('fayz_cart_products',JSON.stringify(cartProducts)); },[cartProducts]);
  useEffect(() => { localStorage.setItem('fayz_profile',JSON.stringify(profile)); },[profile]);
  useEffect(() => { localStorage.setItem('fayz_orders',JSON.stringify(savedOrders)); },[savedOrders]);
  useEffect(() => { localStorage.setItem('fayz_theme',theme); document.documentElement.dataset.theme = themes[theme] ? theme : 'yellow'; paintSystemBars(); },[theme]);
  const load = useCallback(async (nextPage=1, append=false) => {
    setLoading(true); setError(''); setOffline(false);
    try {
      const query = new URLSearchParams({ page:String(nextPage),limit:'20',sort });
      if (search.trim()) query.set('q',search.trim()); if (category) query.set('category',category);
      const [catalog,cats,config,top] = await Promise.all([
        api<{products:Product[];total:number}>('/products?'+query), api<{categories:Category[]}>('/categories'),
        api<{settings:Record<string,string>}>('/settings'),api<{products:Product[]}>('/products?featured=1&limit=8')
      ]);
      setProducts(old => append ? [...old,...catalog.products] : catalog.products); setTotal(catalog.total); setPage(nextPage);
      setCategories(cats.categories); setSettings(config.settings); setFeatured(top.products);
    } catch(e) { setError(friendlyError(e)); setOffline(isNetworkFailure(e)); } finally { setLoading(false); }
  },[search,category,sort]);
  useEffect(() => { const timer=setTimeout(() => load(),search ? 350 : 0); return () => clearTimeout(timer); },[load]);
  useEffect(() => {
    const open = async (slug:string) => { try { const result=await api<{product:Product}>('/products/'+encodeURIComponent(slug)); setSelected(result.product); setTab('catalog'); } catch(e) { setError(friendlyError(e)); } };
    const initial = location.hash.match(/^#\/p\/([a-z0-9-]+)/)?.[1]; if(initial) void open(initial);
    const handler=(event:Event) => { const slug=(event as CustomEvent<string>).detail; if(slug) void open(slug); };
    window.addEventListener('fayz-product',handler); return () => window.removeEventListener('fayz-product',handler);
  },[]);
  const cartItems = useMemo(() => Object.entries(cart).map(([id,quantity]) => ({ product:cartProducts[id] || products.find(p => p.id===Number(id)),quantity })).filter((x):x is {product:Product;quantity:number} => !!x.product),[cart,cartProducts,products]);
  const cartTotal = cartItems.reduce((sum,x) => sum+x.product.price*x.quantity,0);
  const cartCount = Object.values(cart).reduce((a,b)=>a+b,0);
  function quantity(product:Product, delta:number) { setCartProducts(old => ({...old,[product.id]:product})); setCart(old => { const next={...old}; const count=Math.min(product.stock,Math.max(0,(next[product.id]||0)+delta)); if(count) next[product.id]=count; else delete next[product.id]; return next; }); }
  const refreshOrders = useCallback(async () => { setOrderError(''); setOrdersLoading(true); try { const result=await Promise.all(savedOrders.map(async saved => (await api<{order:OrderDetail}>(`/orders/${saved.id}`,{headers:{Authorization:`Order ${saved.accessToken}`}})).order)); setOrders(Object.fromEntries(result.map(order => [order.id,order]))); } catch(e) { setOrderError(friendlyError(e)); } finally { setOrdersLoading(false); } },[savedOrders]);
  useEffect(() => { if(tab==='orders' && savedOrders.length) void refreshOrders(); },[tab,savedOrders.length]);
  const nameInvalid = profile.customerName.trim().length<2, phoneInvalid = !/^\+998\d{9}$/.test(profile.phone), addressInvalid = profile.address.trim().length<5;
  async function submit() {
    if(submitting) return;
    setAttempted(true);
    if(nameInvalid || phoneInvalid || addressInvalid) { setCheckoutError(CHECKOUT_RULES); return; }
    if(!cartItems.length) return;
    setSubmitting(true); setCheckoutError('');
    try {
      const latest=await Promise.all(cartItems.map(x => api<{product:Product}>('/products/'+encodeURIComponent(x.product.slug)).then(r => r.product)));
      setCartProducts(Object.fromEntries(latest.map(p => [p.id,p])));
      if(latest.some((p,i) => p.price!==cartItems[i].product.price || p.stock<cartItems[i].quantity)) { setCheckout(false); setCartNotice('Narx yoki qoldiq oʻzgardi. Savatni qayta tekshiring.'); await load(); return; }
      const result=await api<{order:StoredOrder}>('/orders',{method:'POST',body:JSON.stringify({customerName:profile.customerName.trim(),phone:profile.phone,address:profile.address.trim(),note,items:cartItems.map(x => ({productId:x.product.id,quantity:x.quantity}))})});
      setSavedOrders(old => [result.order,...old]); setCart({}); setCartProducts({}); setCheckout(false); setConfirmation(result.order.orderNumber); setTab('orders'); setCartNotice(''); setAttempted(false);
    } catch(e) { setCheckoutError('Buyurtma yuborilmadi: '+friendlyError(e)); } finally { setSubmitting(false); }
  }
  const go = (next:Tab) => { setSelected(null); setTab(next); window.scrollTo({top:0}); };
  const openSearch = () => { go('catalog'); setFocusSearch(true); };
  useEffect(() => { if(focusSearch && tab==='catalog') { searchRef.current?.focus(); setFocusSearch(false); } },[focusSearch,tab]);
  const addToCart = (product:Product) => { quantity(product,1); setToast({message:'Savatga qoʻshildi',action:'Savatni ochish',onAction:() => go('cart')}); };
  const openProduct = (product:Product) => { setSelected(product); window.scrollTo({top:0}); };
  const closeCheckout = useCallback(() => setCheckout(false),[]);
  const hideToast = useCallback(() => setToast(null),[]);
  const share = (product:Product) => { const text=`Fayz Market: ${product.name} — ${API}/p/${product.slug}`; if(window.FayzNative) window.FayzNative.share(text); else navigator.share?.({text}).catch(() => navigator.clipboard?.writeText(text)); };

  const card = (p:Product, rail=false) => <ProductCard key={p.id} product={p} rail={rail} inCart={cart[p.id]||0} onOpen={() => openProduct(p)} onAdd={() => addToCart(p)} />;
  const errorState = error && <div className="state-card" role="alert">
    <div className="empty-icon"><Icon name={offline?'wifiOff':'alert'} size={30} stroke={1.6} /></div>
    <h2 className="t-h2">{offline?'Aloqa yoʻq':'Maʼlumot yuklanmadi'}</h2><p className="t-body t-muted">{error}</p>
    <div className="state-actions"><button className="btn btn-primary" onClick={() => load()}><Icon name="refresh" size={18} />Qayta urinish</button>{debug && <button className="btn btn-secondary" onClick={openApiSettings}><Icon name="server" size={18} />Server manzili</button>}</div>
  </div>;
  const productGrid = <>
    {errorState}
    {!error && <div className="grid" aria-busy={loading}>{products.map(p => card(p))}{loading && !products.length && Array.from({length:6},(_,i) => <ProductSkeleton key={i} />)}</div>}
    {!loading && !error && !products.length && <EmptyState icon="search" title="Mahsulot topilmadi" text={search||category?'Boshqa soʻz bilan qidirib koʻring yoki filtrni tozalang.':'Katalog hozircha boʻsh.'} action={(search||category) ? <button className="btn btn-secondary" onClick={() => { setSearch(''); setCategory(''); }}>Filtrni tozalash</button> : undefined} />}
    {products.length<total && !error && <button className="btn btn-secondary btn-block load-more" onClick={() => load(page+1,true)} disabled={loading}>{loading ? <><span className="spinner" />Yuklanmoqda...</> : 'Yana koʻrish'}</button>}
  </>;
  const profileFields = (inSheet:boolean) => <>
    <Field label="Ism" error={inSheet && attempted && nameInvalid ? 'Ismingizni kiriting (kamida 2 ta harf)' : undefined}><input className="input" value={profile.customerName} onChange={e => setProfile({...profile,customerName:e.target.value})} onFocus={revealOnFocus} autoComplete="name" placeholder="Ismingiz" aria-invalid={inSheet && attempted && nameInvalid} /></Field>
    <Field label="Telefon" error={inSheet && attempted && phoneInvalid ? 'Raqamni +998 va 9 ta raqam bilan kiriting' : undefined} hint="Masalan: +998901234567"><input className="input num" type="tel" inputMode="tel" value={profile.phone} onChange={e => setProfile({...profile,phone:e.target.value})} onFocus={revealOnFocus} placeholder="+998901234567" autoComplete="tel" aria-invalid={inSheet && attempted && phoneInvalid} /></Field>
    <Field label="Yetkazib berish manzili" error={inSheet && attempted && addressInvalid ? 'Manzilni toʻliq kiriting' : undefined}><textarea className="input" value={profile.address} onChange={e => setProfile({...profile,address:e.target.value})} onFocus={revealOnFocus} autoComplete="street-address" placeholder="Shahar, tuman, koʻcha, uy" aria-invalid={inSheet && attempted && addressInvalid} /></Field>
  </>;

  let screen;
  if (selected) {
    const inCart = cart[selected.id]||0;
    screen = <div className="detail">
      <div className="detail-bar"><button className="icon-btn filled" onClick={() => setSelected(null)} aria-label="Orqaga"><Icon name="back" /></button><button className="icon-btn filled" onClick={() => share(selected)} aria-label="Ulashish"><Icon name="share" size={20} /></button></div>
      <Gallery product={selected} />
      <div className="detail-info">
        <span className="t-caption">{selected.categoryName}</span>
        <h1 className="t-h1">{selected.name}</h1>
        <p className="detail-price num">{money(selected.price)}</p>
        <span className={`badge ${selected.stock?'badge-ok':'badge-danger'}`}>{selected.stock ? `${selected.stock} dona mavjud` : 'Hozir sotuvda yoʻq'}</span>
        {selected.description && <div className="detail-desc"><h2 className="t-label">Tavsif</h2><p className="t-body">{selected.description}</p></div>}
      </div>
      <div className="action-bar">
        <div className="action-meta"><span className="t-caption">{inCart ? `Savatda: ${inCart} dona` : 'Narxi'}</span><strong className="num">{money(selected.price)}</strong></div>
        <button className="btn btn-primary btn-lg" disabled={!selected.stock || inCart>=selected.stock} onClick={() => addToCart(selected)}><Icon name="bag" size={20} />Savatga qoʻshish</button>
      </div>
    </div>;
  } else if (tab==='home') {
    screen = <div className="screen">
      <button className="search-trigger" onClick={openSearch}><Icon name="search" size={20} /><span>Mahsulot qidirish</span></button>
      <section className="hero" aria-label="Doʻkon banneri">
        <div className="hero-copy"><h1 className="t-display">{settings.banner_title||'Fayz Market'}</h1><p>{settings.banner_subtitle||'Siz uchun aksessuarlar'}</p><button className="btn btn-ink" onClick={() => go('catalog')}>Katalogni ochish</button></div>
        <svg className="hero-mark" viewBox="280 190 470 680" aria-hidden="true"><path d="M307 379h410l-28 396c-3 42-38 74-80 74H415c-42 0-77-32-80-74z" /><path d="M405 390v-69c0-63 47-112 107-112s107 49 107 112v69" /><path className="hero-f" d="M450 487v250m0-250h150m-150 110h124" /></svg>
      </section>
      {categories.length>0 && <section className="block"><SectionHeader title="Kategoriyalar" /><div className="rail cats">{categories.map(c => <button key={c.id} className="cat-tile" onClick={() => { setCategory(c.slug); go('catalog'); }}><span className="cat-initial" aria-hidden="true">{c.name.slice(0,1)}</span><span>{c.name}</span></button>)}</div></section>}
      {featured.length>0 && <section className="block"><SectionHeader title="Tanlangan mahsulotlar" /><div className="rail products-rail">{featured.map(p => card(p,true))}</div></section>}
      <section className="block"><SectionHeader title={category ? (categories.find(c => c.slug===category)?.name || 'Mahsulotlar') : 'Barcha mahsulotlar'} action={<button className="link-btn" onClick={() => go('catalog')}>Katalog<Icon name="chevron" size={16} /></button>} />{productGrid}</section>
    </div>;
  } else if (tab==='catalog') {
    screen = <div className="screen">
      <div className="catalog-tools">
        <h1 className="t-h1">Katalog</h1>
        <label className="search-field"><Icon name="search" size={20} /><span className="visually-hidden">Mahsulot qidirish</span><input ref={searchRef} type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Mahsulot qidirish" enterKeyHint="search" />{search && <button className="icon-btn" onClick={() => setSearch('')} aria-label="Qidiruvni tozalash"><Icon name="close" size={18} /></button>}</label>
        <div className="rail chips" role="group" aria-label="Kategoriya"><button className={`chip${!category?' active':''}`} aria-pressed={!category} onClick={() => setCategory('')}>Barchasi</button>{categories.map(c => <button key={c.id} className={`chip${category===c.slug?' active':''}`} aria-pressed={category===c.slug} onClick={() => setCategory(c.slug)}>{c.name}</button>)}</div>
        <div className="results-row"><span className="t-label num">{loading && !products.length ? 'Yuklanmoqda...' : `${total} ta mahsulot`}</span><label className="sort-select"><Icon name="sort" size={16} /><span className="visually-hidden">Saralash</span><select value={sort} onChange={e => setSort(e.target.value)}>{sorts.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      </div>
      {productGrid}
    </div>;
  } else if (tab==='cart') {
    screen = <div className="screen">
      <header className="page-head"><h1 className="t-h1">Savat</h1>{cartItems.length>0 && <span className="t-caption num">{cartCount} dona mahsulot</span>}</header>
      {cartNotice && <div className="banner banner-warning" role="alert"><Icon name="alert" size={20} /><div>{cartNotice}</div></div>}
      {cartItems.length ? <>
        <div className="cart-list">{cartItems.map(({product,quantity:count}) => <div className="cart-row" key={product.id}>
          <button className="cart-thumb" onClick={() => openProduct(product)} aria-label={product.name}><ProductImage src={product.images[0]} /></button>
          <div className="cart-info"><span className="cart-name">{product.name}</span><span className="t-caption num">{money(product.price)} / dona</span>
            <div className="cart-bottom"><div className="stepper" role="group" aria-label={`${product.name} miqdori`}><button onClick={() => quantity(product,-1)} aria-label={count===1?'Savatdan olib tashlash':'Kamaytirish'}><Icon name={count===1?'trash':'minus'} size={17} /></button><b className="num" aria-live="polite">{count}</b><button onClick={() => quantity(product,1)} disabled={count>=product.stock} aria-label="Koʻpaytirish"><Icon name="plus" size={17} /></button></div><strong className="num">{money(product.price*count)}</strong></div>
          </div>
        </div>)}</div>
        <div className="summary"><div><span>Mahsulotlar</span><span className="num">{cartCount} dona</span></div>{settings.delivery_info && <div className="t-caption summary-note"><Icon name="truck" size={16} />{settings.delivery_info}</div>}<div className="summary-total"><span>Jami</span><strong className="num">{money(cartTotal)}</strong></div></div>
        <div className="action-bar"><div className="action-meta"><span className="t-caption">Jami</span><strong className="num">{money(cartTotal)}</strong></div><button className="btn btn-primary btn-lg" onClick={() => { setCheckoutError(''); setCheckout(true); }}>Buyurtma berish</button></div>
      </> : <EmptyState icon="bag" title="Savat boʻsh" text="Yoqqan mahsulotni savatga qoʻshing — u shu yerda saqlanadi." action={<button className="btn btn-primary" onClick={() => go('catalog')}>Katalogga oʻtish</button>} />}
    </div>;
  } else if (tab==='orders') {
    screen = <div className="screen">
      <header className="page-head row"><h1 className="t-h1">Buyurtmalarim</h1><button className="icon-btn filled" onClick={refreshOrders} disabled={ordersLoading} aria-label="Yangilash"><span className={ordersLoading?'spin-icon':''}><Icon name="refresh" size={20} /></span></button></header>
      {confirmation && <div className="banner banner-success" role="status"><Icon name="check" size={20} stroke={2.2} /><div><strong>Buyurtma qabul qilindi</strong>Raqami: <span className="num">{confirmation}</span>. Holatini shu yerda kuzatishingiz mumkin.</div></div>}
      {orderError && <div className="banner banner-error" role="alert"><Icon name="alert" size={20} /><div>{orderError}<br /><button className="btn btn-sm btn-secondary" onClick={refreshOrders}>Qayta urinish</button></div></div>}
      {!savedOrders.length && <EmptyState icon="receipt" title="Hali buyurtma yoʻq" text="Birinchi buyurtmangizni bering — holati shu yerda koʻrinadi." action={<button className="btn btn-primary" onClick={() => go('catalog')}>Katalogga oʻtish</button>} />}
      <div className="order-list">{savedOrders.map(saved => { const order=orders[saved.id]; return <article className="order-card" key={saved.id}>
        <div className="order-top"><div><span className="t-caption">Buyurtma</span><strong className="num order-no">{saved.orderNumber}</strong></div>{order ? <span className={`badge badge-${order.status}`}>{statusNames[order.status]||order.status}</span> : <span className="skeleton" style={{width:84,height:24,borderRadius:99}} />}</div>
        {order ? <>
          <span className="t-caption">{formatDateTime(order.createdAt)}</span>
          <ul className="order-items">{order.items.map((item,i) => <li key={i}><span>{item.name}</span><span className="num">× {item.quantity}</span></li>)}</ul>
          <div className="order-total"><span>Jami</span><strong className="num">{money(order.total)}</strong></div>
        </> : !orderError && <div aria-hidden="true"><div className="skeleton" style={{height:12,width:'40%',marginTop:4}} /><div className="skeleton" style={{height:12,width:'75%',marginTop:14}} /></div>}
      </article>; })}</div>
    </div>;
  } else {
    screen = <div className="screen">
      <header className="page-head"><h1 className="t-h1">Profil</h1></header>
      <div className="profile-card"><div className="avatar" aria-hidden="true">{profile.customerName.trim() ? profile.customerName.trim().slice(0,1).toUpperCase() : <Icon name="user" size={26} />}</div><div><strong>{profile.customerName.trim() || 'Ismingizni kiriting'}</strong><span className="t-caption num">{profile.phone.length>4 ? profile.phone : 'Telefon raqami kiritilmagan'}</span></div></div>
      <section className="panel"><SectionHeader title="Yetkazib berish maʼlumotlari" /><p className="t-caption panel-note">Maʼlumotlar faqat shu telefonda saqlanadi va buyurtma berishda avtomatik toʻldiriladi.</p><div className="form-stack">{profileFields(false)}</div></section>
      <section className="panel"><SectionHeader title="Koʻrinish" /><div className="themes" role="radiogroup" aria-label="Rang mavzusi">{Object.entries(themes).map(([key,t]) => <button key={key} role="radio" aria-checked={theme===key} className={`theme-opt${theme===key?' active':''}`} onClick={() => setTheme(key)}><span className="swatch" style={{background:`linear-gradient(135deg, ${t.swatch[0]} 0 50%, ${t.swatch[1]} 50% 100%)`}}>{theme===key && <Icon name="check" size={16} stroke={2.6} />}</span><span>{t.label}</span></button>)}</div></section>
      <section className="panel"><SectionHeader title="Doʻkon bilan aloqa" /><div className="info-rows"><div className="info-row"><Icon name="phone" size={20} /><div><span className="t-caption">Telefon</span><span className="num">{settings.contact_phone||'Aloqa raqami kiritilmagan'}</span></div></div>{settings.delivery_info && <div className="info-row"><Icon name="truck" size={20} /><div><span className="t-caption">Yetkazib berish</span><span>{settings.delivery_info}</span></div></div>}</div></section>
      {debug && <section className="panel"><SectionHeader title="Texnik sozlamalar" /><p className="t-caption panel-note">Faqat sinov (debug) ilovasida koʻrinadi.</p><div className="info-rows"><button className="info-row as-btn" onClick={openApiSettings}><Icon name="server" size={20} /><div><span>Server (API) manzili</span><span className="t-caption">Server manzilini oʻzgartirish</span></div><Icon name="chevron" size={18} /></button><button className="info-row as-btn" onClick={nativeReload}><Icon name="refresh" size={20} /><div><span>Ilovani qayta yuklash</span><span className="t-caption">Serverdan maʼlumotlarni qaytadan olish</span></div><Icon name="chevron" size={18} /></button></div></section>}
      <p className="t-caption app-version">Fayz Market V1.0</p>
    </div>;
  }

  const navItems: [Tab,string,'home'|'grid'|'bag'|'receipt'|'user'][] = [['home','Bosh sahifa','home'],['catalog','Katalog','grid'],['cart','Savat','bag'],['orders','Buyurtmalar','receipt'],['profile','Profil','user']];
  const showHeader = !selected && tab==='home';
  return <div className={`app${selected||(tab==='cart'&&cartItems.length)?' has-action':''}`}>
    {showHeader && <header className="app-header"><div className="brand"><BrandMark size={36} /><div><strong>Fayz Market</strong><span>Aksessuarlar doʻkoni</span></div></div>{tab==='home' && <button className="icon-btn" onClick={openSearch} aria-label="Qidirish"><Icon name="search" /></button>}</header>}
    <main key={selected ? 'p'+selected.id : tab} className="main">{screen}</main>
    <nav className="tabbar" aria-label="Asosiy menyu"><div className="tabbar-inner">{navItems.map(([key,label,icon]) => { const current = tab===key && !selected; return <button key={key} className={current?'current':''} aria-current={current?'page':undefined} aria-label={key==='cart' ? `Savat, ${cartCount} ta mahsulot` : undefined} onClick={() => go(key)}><span className="tab-icon"><Icon name={icon} size={22} stroke={current?2:1.8} />{key==='cart' && cartCount>0 && <span className="tab-badge num">{cartCount>99?'99+':cartCount}</span>}</span><span className="tab-label">{label}</span></button>; })}</div></nav>
    {checkout && <Sheet title="Buyurtmani rasmiylashtirish" onClose={closeCheckout} footer={<><button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={submitting}>{submitting ? <><span className="spinner" />Yuborilmoqda...</> : <>Buyurtmani yuborish<span className="btn-total num">{money(cartTotal)}</span></>}</button><button className="btn btn-quiet btn-block" onClick={closeCheckout} disabled={submitting}>Bekor qilish</button></>}>
      <div className="co-summary"><div className="co-items">{cartItems.map(({product,quantity:count}) => <div key={product.id} className="co-item"><span className="co-thumb"><ProductImage src={product.images[0]} /></span><span className="co-name">{product.name}<span className="t-caption num"> × {count}</span></span><span className="num">{money(product.price*count)}</span></div>)}</div><div className="summary-total"><span>Jami</span><strong className="num">{money(cartTotal)}</strong></div></div>
      {checkoutError && <div className="banner banner-error" role="alert"><Icon name="alert" size={20} /><div>{checkoutError}</div></div>}
      <div className="form-stack"><h3 className="t-h2">Qabul qiluvchi</h3>{profileFields(true)}<Field label="Izoh" hint="Ixtiyoriy: qulay vaqt, moʻljal va boshqalar"><textarea className="input" value={note} onChange={e => setNote(e.target.value)} onFocus={revealOnFocus} /></Field></div>
    </Sheet>}
    {toast && <Toast message={toast.message} action={toast.action} onAction={toast.onAction} onDone={hideToast} />}
  </div>;
}

function Gallery({ product }: { product: Product }) {
  const [index,setIndex] = useState(0);
  const images = product.images;
  if (!images.length) return <div className="gallery"><div className="slide"><ProductImage alt={product.name} /></div></div>;
  return <div className="gallery-wrap"><div className="gallery" onScroll={e => { const el=e.currentTarget; setIndex(Math.round(el.scrollLeft/Math.max(1,el.clientWidth))); }}>{images.map((url,i) => <div className="slide" key={i}><ProductImage src={url} alt={`${product.name} ${i+1}`} fit="contain" /></div>)}</div>{images.length>1 && <div className="dots" aria-hidden="true">{images.map((_,i) => <span key={i} className={i===index?'on':''} />)}</div>}</div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
