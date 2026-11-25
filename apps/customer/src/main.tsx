import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { money } from '@fayz/shared';
import type { Category, Product } from '@fayz/shared';
import { Icon } from '../../../packages/ui/src/Icon';
import { BrandMark, useBrand } from '../../../packages/ui/src/brand';
import { BannerCarousel, paymentMethodNames, paymentStatusBadge, paymentStatusNames, type PaymentOption } from '../../../packages/ui/src/storefront';
import { LocationStrip, StoreScreen, detectLocation, useStorefront, useUserLocation, type UserLocation } from './storefront';
import { formatDateTime, friendlyError, isNetworkFailure, nativeDebug, nativeReload, openApiSettings, paintSystemBars } from '../../../packages/ui/src/format';
import { EmptyState, Field, ProductCard, ProductImage, ProductSkeleton, SectionHeader, Sheet, Toast, revealOnFocus } from './components';
import { AuthSheet, ConfirmDelivery, LinkPhoneSheet, LocationSheet, PhoneLoginSheet, ProductReviews, ReviewSheet, TrackingSheet, startTelegram, takeTelegramResult, type AuthConfig, type Customer, type DeliveryLocation, type OrderView } from './account';
import { biometricDisable, biometricEnable, biometricStatus, biometricStored, biometricUnlock, openExternal, systemNotify } from '../../../packages/ui/src/native';
import { formatCoords } from '../../../packages/ui/src/maps';
import { stageBadge, stageNames } from '../../../packages/ui/src/stages';
import { loadOrderHistory } from './order-history';
import '../../../packages/ui/src/tokens.css';
import '../../../packages/ui/src/expansion.css';
import '../../../packages/ui/src/storefront.css';
import './style.css';

declare global { interface Window { FayzNative?: { share: (text: string) => void; isDebug?: () => boolean; openApiSettings?: () => void; reload?: () => void; setSystemBars?: (color: string, light: boolean) => void } } }
type Tab = 'home' | 'catalog' | 'cart' | 'orders' | 'profile';
type StoredOrder = { id: number; orderNumber: string; accessToken: string; total: number; status: string; paymentMethod?: string };
type OrderDetail = OrderView;
type Profile = { customerName: string; phone: string; address: string };
const API = import.meta.env.VITE_API_URL || (location.pathname.startsWith('/__app/') ? location.origin : 'http://localhost:8787');
const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };
// Customer session token (module scope so every API call can attach it). Order-token calls pass their own header.
let customerToken = '';
const BIO_FLAG = 'fayz_bio_login';
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const own = init?.headers as Record<string,string> | undefined;
  const auth = customerToken && !own?.Authorization ? { Authorization: `Customer ${customerToken}` } : {};
  const response = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...auth, ...own } as Record<string,string> });
  let data: any;
  try { data = await response.json(); } catch { throw new Error('Server javobi oʻqilmadi'); }
  if (!response.ok) throw new Error(data.error?.message || `Server xatosi (${response.status})`);
  return data as T;
}
const statusNames: Record<string,string> = { new:'Yangi', confirmed:'Tasdiqlangan', preparing:'Tayyorlanmoqda', shipped:'Yoʻlda', delivered:'Yetkazildi', cancelled:'Bekor qilingan' };
const themes: Record<string,{ label: string; swatch: [string,string] }> = { yellow:{label:'Sariq',swatch:['#FFCC29','#FFFFFF']}, green:{label:'Yashil',swatch:['#2DBE7E','#FFFFFF']}, blue:{label:'Koʻk',swatch:['#2F6FEB','#FFFFFF']}, black:{label:'Qora',swatch:['#1E1E1B','#FFCC29']} };
const sorts: [string,string][] = [['newest','Yangi'],['price_asc','Arzonroq'],['price_desc','Qimmatroq'],['name','Nomi boʻyicha']];
const CHECKOUT_RULES = 'Ism, +998 formatidagi telefon va manzilni toʻliq kiriting.';
const PICKUP_RULES = 'Ism va +998 formatidagi telefonni kiriting.';
// Pickup orders reuse the order statuses; only their wording differs from a courier delivery.
const pickupNames: Record<string,string> = { new:'Qabul qilindi', confirmed:'Tasdiqlandi', preparing:'Tayyorlanmoqda', shipped:'Olib ketishga tayyor', delivered:'Topshirildi', cancelled:'Bekor qilindi' };
const paymentHints: Record<string,(pickup:boolean)=>string> = {
  cash: pickup => pickup ? 'Doʻkonda olayotganda naqd toʻlaysiz' : 'Buyurtmani olganingizda kuryerga naqd toʻlaysiz',
  card_terminal: pickup => pickup ? 'Doʻkondagi terminal orqali karta bilan' : 'Kuryerdagi terminal orqali karta bilan (oldindan kelishiladi)',
  bank_transfer: () => 'Buyurtmadan soʻng rekvizitlar koʻrsatiladi; pul tushgach doʻkon tasdiqlaydi',
  payme: () => 'Payme’ning xavfsiz sahifasi ochiladi — karta maʼlumoti ilovaga kiritilmaydi',
  click: () => 'Click’ning xavfsiz sahifasi ochiladi — karta maʼlumoti ilovaga kiritilmaydi',
};
const paymentIcons: Record<string,'cash'|'card'|'bank'|'wallet'> = { cash:'cash', card_terminal:'card', bank_transfer:'bank', payme:'wallet', click:'wallet' };

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
  // Accounts, delivery location, tracking and reviews (V1 expansion).
  const [authConfig,setAuthConfig] = useState<AuthConfig|null>(null);
  const [customer,setCustomer] = useState<Customer|null>(null);
  const [authSheet,setAuthSheet] = useState<'login'|'register'|null>(null); const [linkPhone,setLinkPhone] = useState(false);
  const [locked,setLocked] = useState(() => localStorage.getItem(BIO_FLAG)==='1' && biometricStored());
  const [accountError,setAccountError] = useState('');
  const [dropoff,setDropoff] = useState<DeliveryLocation|null>(null); const [locationSheet,setLocationSheet] = useState(false);
  const [deliveryDetails,setDeliveryDetails] = useState('');
  const [accountOrders,setAccountOrders] = useState<OrderView[]>([]);
  const [tracking,setTracking] = useState<OrderView|null>(null); const [reviewing,setReviewing] = useState<OrderView|null>(null);
  const [orderBusy,setOrderBusy] = useState(0);
  const bio = useMemo(biometricStatus,[]);
  // V1 storefront: brand, store location, banners, checkout options (cached for offline start).
  const { storefront } = useStorefront(api);
  const brand = useBrand(storefront?.brand);
  const [userLocation,setUserLocation] = useUserLocation();
  const [locating,setLocating] = useState(false); const [storeOpen,setStoreOpen] = useState(false);
  const [userSheet,setUserSheet] = useState<{notice:string}|null>(null);
  const [fulfillment,setFulfillment] = useState<'delivery'|'pickup'>('delivery');
  const [paymentMethod,setPaymentMethod] = useState('cash');
  const [paying,setPaying] = useState(0); const [quickLogin,setQuickLogin] = useState(false); const [locatingDrop,setLocatingDrop] = useState(false);
  const checkoutOptions = storefront?.checkout;
  const payOptions: PaymentOption[] = checkoutOptions?.payments?.length ? checkoutOptions.payments : [{ method:'cash', label:'Naqd pul', online:false }];
  const pickupOffered = !!checkoutOptions?.fulfillment?.includes('pickup');
  useEffect(() => { if(!payOptions.some(o => o.method===paymentMethod)) setPaymentMethod(payOptions[0].method); if(fulfillment==='pickup' && !pickupOffered) setFulfillment('delivery'); },[JSON.stringify(payOptions),pickupOffered]);
  const mapsKey = settings.google_maps_key || undefined;
  const dark = theme==='black';
  const signIn = useCallback((token:string, who:Customer) => {
    customerToken = token; setCustomer(who); setAuthSheet(null); setQuickLogin(false); setLocked(false);
    if(localStorage.getItem(BIO_FLAG)==='1' && biometricStored()) void biometricEnable(token); else localStorage.setItem('fayz_customer_token',token);
    setProfile(old => ({ ...old, customerName: old.customerName.trim() || who.name, phone: who.phone && who.phoneVerified ? who.phone : old.phone }));
    setToast({message:`Xush kelibsiz, ${who.name || 'mijoz'}!`});
  },[]);
  const signOut = async () => { try { await api('/auth/logout',{method:'POST'}); } catch { /* offline: forget locally anyway */ } customerToken=''; setCustomer(null); setAccountOrders([]); localStorage.removeItem('fayz_customer_token'); localStorage.removeItem(BIO_FLAG); biometricDisable(); };
  const restore = useCallback(async (token:string) => { customerToken = token; try { const r = await api<{customer:Customer}>('/auth/me'); setCustomer(r.customer); return true; } catch { customerToken=''; return false; } },[]);
  useEffect(() => {
    void api<AuthConfig>('/auth/config').then(setAuthConfig).catch(() => setAuthConfig(null));
    const tg = takeTelegramResult();
    const saved = localStorage.getItem('fayz_customer_token');
    (async () => {
      if(saved && !(await restore(saved))) localStorage.removeItem('fayz_customer_token');
      if(tg) { try { const r = await api<{token?:string;customer:Customer}>(tg.intent==='link' && customerToken ? '/auth/telegram/link' : '/auth/telegram',{method:'POST',body:JSON.stringify({auth:tg.auth})}); if(r.token) signIn(r.token,r.customer); else { setCustomer(r.customer); setToast({message:'Telegram hisobingiz bogʻlandi'}); } setTab('profile'); } catch(e) { setAccountError(friendlyError(e)); setTab('profile'); } }
    })();
  },[]);
  const unlock = async () => { setAccountError(''); const r = await biometricUnlock(); if(r.ok && await restore(r.value)) { setLocked(false); return; }
    // A new fingerprint enrolled on the phone (or a removed screen lock) permanently invalidates the Keystore key.
    if(!r.ok && (r.value==='invalidated' || r.value==='empty')) { localStorage.removeItem(BIO_FLAG); setAccountError('Telefonda barmoq izlari oʻzgargani uchun bu usul oʻchirildi. Parol bilan kiring va uni qayta yoqing.'); return; }
    setAccountError(r.ok ? 'Sessiya tugagan. Parol bilan qayta kiring.' : r.value==='cancelled' ? '' : 'Barmoq izi tasdiqlanmadi'); };
  const toggleBiometric = async () => {
    if(localStorage.getItem(BIO_FLAG)==='1') { biometricDisable(); localStorage.removeItem(BIO_FLAG); localStorage.setItem('fayz_customer_token',customerToken); setToast({message:'Barmoq izi bilan kirish oʻchirildi'}); return; }
    const r = await biometricEnable(customerToken);
    if(r.ok) { localStorage.setItem(BIO_FLAG,'1'); localStorage.removeItem('fayz_customer_token'); setToast({message:'Endi ilova barmoq izi bilan ochiladi'}); }
    else setAccountError(r.value==='cancelled' ? 'Bekor qilindi' : 'Barmoq izini yoqib boʻlmadi');
  };
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
  const openSlug = useCallback(async (slug:string) => { try { const result=await api<{product:Product}>('/products/'+encodeURIComponent(slug)); setSelected(result.product); setTab('catalog'); window.scrollTo({top:0}); } catch(e) { setToast({message:friendlyError(e)}); } },[]);
  useEffect(() => {
    const open = openSlug;
    const initial = location.hash.match(/^#\/p\/([a-z0-9-]+)/)?.[1]; if(initial) void open(initial);
    const handler=(event:Event) => { const slug=(event as CustomEvent<string>).detail; if(slug) void open(slug); };
    window.addEventListener('fayz-product',handler); return () => window.removeEventListener('fayz-product',handler);
  },[]);
  const cartItems = useMemo(() => Object.entries(cart).map(([id,quantity]) => ({ product:cartProducts[id] || products.find(p => p.id===Number(id)),quantity })).filter((x):x is {product:Product;quantity:number} => !!x.product),[cart,cartProducts,products]);
  const cartTotal = cartItems.reduce((sum,x) => sum+x.product.price*x.quantity,0);
  const cartCount = Object.values(cart).reduce((a,b)=>a+b,0);
  // Courier fee: a separate line on top of the goods, as the shop set it (the server recomputes it on the order).
  const feeRule = { fee: storefront?.checkout?.deliveryFee || 0, freeFrom: storefront?.checkout?.deliveryFreeFrom || 0 };
  const feeFor = (isPickup:boolean) => isPickup || !feeRule.fee || (feeRule.freeFrom>0 && cartTotal>=feeRule.freeFrom) ? 0 : feeRule.fee;
  function quantity(product:Product, delta:number) { setCartProducts(old => ({...old,[product.id]:product})); setCart(old => { const next={...old}; const count=Math.min(product.stock,Math.max(0,(next[product.id]||0)+delta)); if(count) next[product.id]=count; else delete next[product.id]; return next; }); }
  const orderHeaders = useCallback((id:number):Record<string,string> => { const saved=savedOrders.find(o => o.id===id); return saved ? {Authorization:`Order ${saved.accessToken}`} : {}; },[savedOrders]);
  const refreshOrders = useCallback(async (quiet=false) => {
    if(!quiet) { setOrderError(''); setOrdersLoading(true); }
    try {
      const sessionAtStart = customerToken;
      const result = await loadOrderHistory(
        savedOrders.map(saved => async () => (await api<{order:OrderDetail}>(`/orders/${saved.id}`,{headers:{Authorization:`Order ${saved.accessToken}`}})).order),
        () => customerToken ? api<{orders:OrderView[]}>('/customer/orders').then(r => r.orders) : Promise.resolve([] as OrderView[]),
      );
      if (customerToken !== sessionAtStart) return;
      const guest = result.guests, mine = result.account.ok ? result.account.orders : [];
      const all = [...mine,...guest];
      if(result.account.ok) setAccountOrders(mine);
      setOrders(Object.fromEntries(all.map(order => [order.id,order])));
      setOrderError(result.failedGuests || !result.account.ok ? 'Ayrim buyurtmalar yuklanmadi. Qolgan buyurtmalar koʻrsatilmoqda. Qayta urinib koʻring.' : '');
      // Status-change notices: compare with the last stage this device has seen (first sight never notifies).
      const seen = read<Record<string,string>>('fayz_stage_seen',{});
      for(const order of all) { const before=seen[order.id]; if(before && before!==order.stage) systemNotify(`order-${order.id}-${order.stage}`,stageNames[order.stage]||'Buyurtma holati oʻzgardi',order.orderNumber,order.id); seen[order.id]=order.stage; }
      localStorage.setItem('fayz_stage_seen',JSON.stringify(seen));
    } catch(e) { if(!quiet) setOrderError(friendlyError(e)); } finally { if(!quiet) setOrdersLoading(false); }
  },[savedOrders,customer]);
  useEffect(() => { if(tab==='orders' && (savedOrders.length || customer)) void refreshOrders(); },[tab,savedOrders.length,customer]);
  // While the app is open, active orders are re-checked every 30 s (customer notices + confirmation prompt).
  useEffect(() => { if(!savedOrders.length && !customer) return; void refreshOrders(true); const t=setInterval(() => { if(document.visibilityState==='visible') void refreshOrders(true); },30000); return () => clearInterval(t); },[savedOrders.length,customer]);
  useEffect(() => { const open=() => { setSelected(null); setTab('orders'); }; window.addEventListener('fayz-open-order',open); return () => window.removeEventListener('fayz-open-order',open); },[]);
  const orderList = useMemo(() => { const ids=[...new Set([...accountOrders.map(o => o.id),...savedOrders.map(o => o.id)])].sort((a,b) => b-a); return ids.map(id => ({id,order:orders[id],saved:savedOrders.find(o => o.id===id)})); },[accountOrders,savedOrders,orders]);
  const awaiting = orderList.map(x => x.order).filter((o):o is OrderView => !!o && o.canConfirm);
  const confirmOrder = async (order:OrderView) => { setOrderBusy(order.id); try { await api(`/orders/${order.id}/confirm-delivery`,{method:'POST',headers:orderHeaders(order.id)}); const fresh=(await api<{order:OrderView}>(`/orders/${order.id}`,{headers:orderHeaders(order.id)})).order; await refreshOrders(true); setReviewing(fresh); } catch(e) { setOrderError(friendlyError(e)); } finally { setOrderBusy(0); } };
  const disputeOrder = async (order:OrderView, reason:string) => { setOrderBusy(order.id); try { await api(`/orders/${order.id}/dispute`,{method:'POST',headers:orderHeaders(order.id),body:JSON.stringify({reason})}); setToast({message:'Doʻkonga xabar berildi'}); await refreshOrders(true); } catch(e) { setOrderError(friendlyError(e)); } finally { setOrderBusy(0); } };
  const pickup = fulfillment==='pickup';
  const nameInvalid = profile.customerName.trim().length<2, phoneInvalid = !/^\+998\d{9}$/.test(profile.phone), addressInvalid = !pickup && profile.address.trim().length<5;
  async function submit() {
    if(submitting) return;
    setAttempted(true);
    if(nameInvalid || phoneInvalid || addressInvalid) { setCheckoutError(pickup ? PICKUP_RULES : CHECKOUT_RULES); return; }
    if(!cartItems.length) return;
    setSubmitting(true); setCheckoutError('');
    try {
      const latest=await Promise.all(cartItems.map(x => api<{product:Product}>('/products/'+encodeURIComponent(x.product.slug)).then(r => r.product)));
      setCartProducts(Object.fromEntries(latest.map(p => [p.id,p])));
      if(latest.some((p,i) => p.price!==cartItems[i].product.price || p.stock<cartItems[i].quantity)) { setCheckout(false); setCartNotice('Narx yoki qoldiq oʻzgardi. Savatni qayta tekshiring.'); await load(); return; }
      // Pickup still sends a readable address so a server that predates pickup accepts the order unchanged.
      const address = pickup ? `Doʻkondan olib ketish: ${storefront?.store.address || storefront?.store.name || 'Fayz Market'}` : profile.address.trim();
      const result=await api<{order:StoredOrder}>('/orders',{method:'POST',body:JSON.stringify({customerName:profile.customerName.trim(),phone:profile.phone,address,note,items:cartItems.map(x => ({productId:x.product.id,quantity:x.quantity})),...(!pickup && dropoff ? {location:{lat:dropoff.lat,lng:dropoff.lng,...(dropoff.accuracy ? {accuracy:dropoff.accuracy} : {})}} : {}),deliveryDetails:pickup ? '' : deliveryDetails.trim(),fulfillment,paymentMethod})});
      setSavedOrders(old => [{...result.order,paymentMethod},...old]); setCart({}); setCartProducts({}); setCheckout(false); setConfirmation(result.order.orderNumber); setTab('orders'); setCartNotice(''); setAttempted(false); setDeliveryDetails('');
    } catch(e) { setCheckoutError('Buyurtma yuborilmadi: '+friendlyError(e)); } finally { setSubmitting(false); }
  }
  const go = (next:Tab) => { setSelected(null); setTab(next); window.scrollTo({top:0}); };
  const openSearch = () => { go('catalog'); setFocusSearch(true); };
  useEffect(() => { if(focusSearch && tab==='catalog') { searchRef.current?.focus(); setFocusSearch(false); } },[focusSearch,tab]);
  const addToCart = (product:Product) => { quantity(product,1); setToast({message:'Savatga qoʻshildi',action:'Savatni ochish',onAction:() => go('cart')}); };
  const openProduct = (product:Product) => { setSelected(product); window.scrollTo({top:0}); };
  const closeCheckout = useCallback(() => setCheckout(false),[]);
  const hideToast = useCallback(() => setToast(null),[]);
  const locateUser = async () => {
    if(userLocation) { setUserSheet({notice:''}); return; }
    setLocating(true);
    try { setUserLocation(await detectLocation()); setToast({message:'Joylashuvingiz aniqlandi'}); }
    catch(e) { setUserSheet({notice:friendlyError(e)}); } finally { setLocating(false); }
  };
  /** Checkout: the phone's GPS point is attached by itself; the map stays available for a different spot. */
  const openCheckout = () => { setCheckoutError(''); if(!dropoff && userLocation) setDropoff({lat:userLocation.lat,lng:userLocation.lng,accuracy:userLocation.accuracy,address:userLocation.address}); setCheckout(true); };
  const locateDropoff = async () => {
    setLocatingDrop(true);
    try { const here = await detectLocation(); setUserLocation(here); setDropoff({lat:here.lat,lng:here.lng,accuracy:here.accuracy}); }
    catch(e) { setCheckoutError(friendlyError(e)+' Xaritadan nuqtani tanlashingiz mumkin.'); } finally { setLocatingDrop(false); }
  };
  const bannerAction = (target:string) => {
    if(target==='store') setStoreOpen(true);
    else if(target==='catalog') go('catalog');
    else if(target.startsWith('category:')) { setCategory(target.slice(9)); go('catalog'); }
    else if(target.startsWith('product:')) void openSlug(target.slice(8));
  };
  const payOnline = async (order:OrderView) => { setPaying(order.id); try { const r=await api<{url:string}>(`/orders/${order.id}/payment/link`,{headers:orderHeaders(order.id)}); openExternal(r.url); setToast({message:'Toʻlov sahifasi ochildi. Toʻlovdan soʻng shu yerga qayting.'}); } catch(e) { setOrderError(friendlyError(e)); } finally { setPaying(0); } };
  const claimTransfer = async (order:OrderView) => { setPaying(order.id); try { await api(`/orders/${order.id}/payment/claim`,{method:'POST',headers:orderHeaders(order.id)}); setToast({message:'Doʻkon toʻlovni tekshiradi'}); await refreshOrders(true); } catch(e) { setOrderError(friendlyError(e)); } finally { setPaying(0); } };
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
  const profileFields = (inSheet:boolean, withAddress=true) => <>
    <Field label="Ism" error={inSheet && attempted && nameInvalid ? 'Ismingizni kiriting (kamida 2 ta harf)' : undefined}><input className="input" value={profile.customerName} onChange={e => setProfile({...profile,customerName:e.target.value})} onFocus={revealOnFocus} autoComplete="name" placeholder="Ismingiz" aria-invalid={inSheet && attempted && nameInvalid} /></Field>
    <Field label="Telefon" error={inSheet && attempted && phoneInvalid ? 'Raqamni +998 va 9 ta raqam bilan kiriting' : undefined} hint="Masalan: +998901234567"><input className="input num" type="tel" inputMode="tel" value={profile.phone} onChange={e => setProfile({...profile,phone:e.target.value})} onFocus={revealOnFocus} placeholder="+998901234567" autoComplete="tel" aria-invalid={inSheet && attempted && phoneInvalid} /></Field>
    {withAddress && <Field label="Yetkazib berish manzili" error={inSheet && attempted && addressInvalid ? 'Manzilni toʻliq kiriting' : undefined}><textarea className="input" value={profile.address} onChange={e => setProfile({...profile,address:e.target.value})} onFocus={revealOnFocus} autoComplete="street-address" placeholder="Shahar, tuman, koʻcha, uy" aria-invalid={inSheet && attempted && addressInvalid} /></Field>}
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
        <ProductReviews api={api} slug={selected.slug} />
      </div>
      <div className="action-bar">
        <div className="action-meta"><span className="t-caption">{inCart ? `Savatda: ${inCart} dona` : 'Narxi'}</span><strong className="num">{money(selected.price)}</strong></div>
        <button className="btn btn-primary btn-lg" disabled={!selected.stock || inCart>=selected.stock} onClick={() => addToCart(selected)}><Icon name="bag" size={20} />Savatga qoʻshish</button>
      </div>
    </div>;
  } else if (tab==='home') {
    screen = <div className="screen">
      {awaiting.map(order => <ConfirmDelivery key={order.id} compact busy={orderBusy===order.id} onConfirm={() => confirmOrder(order)} onDispute={reason => disputeOrder(order,reason)} />)}
      <div className="home-top">
        <button className="search-trigger" onClick={openSearch}><Icon name="search" size={20} /><span>Mahsulot qidirish</span></button>
        <LocationStrip storefront={storefront} user={userLocation} locating={locating} onStore={() => setStoreOpen(true)} onUser={locateUser} />
      </div>
      <BannerCarousel banners={storefront?.banners || []} fallback={storefront?.defaultBanner || {title:settings.banner_title||'Fayz Market',subtitle:settings.banner_subtitle||'Siz uchun aksessuarlar'}} onCta={bannerAction} dark={dark} />
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
        <div className="summary"><div><span>Mahsulotlar</span><span className="num">{cartCount} dona</span></div>{feeRule.fee>0 && <div><span>Yetkazib berish</span><span className="num">{feeFor(false) ? money(feeFor(false)) : 'bepul'}</span></div>}{feeRule.fee>0 && feeRule.freeFrom>0 && feeFor(false)>0 && <div className="t-caption summary-note"><Icon name="truck" size={16} /><span><span className="num">{money(feeRule.freeFrom)}</span> dan oshsa — yetkazib berish bepul</span></div>}{settings.delivery_info && <div className="t-caption summary-note"><Icon name="truck" size={16} />{settings.delivery_info}</div>}<div className="summary-total"><span>Jami</span><strong className="num">{money(cartTotal+feeFor(false))}</strong></div></div>
        <div className="action-bar"><div className="action-meta"><span className="t-caption">Jami</span><strong className="num">{money(cartTotal+feeFor(false))}</strong></div><button className="btn btn-primary btn-lg" onClick={openCheckout}>Buyurtma berish</button></div>
      </> : <EmptyState icon="bag" title="Savat boʻsh" text="Yoqqan mahsulotni savatga qoʻshing — u shu yerda saqlanadi." action={<button className="btn btn-primary" onClick={() => go('catalog')}>Katalogga oʻtish</button>} />}
    </div>;
  } else if (tab==='orders') {
    screen = <div className="screen">
      <header className="page-head row"><h1 className="t-h1">Buyurtmalarim</h1><button className="icon-btn filled" onClick={() => refreshOrders()} disabled={ordersLoading} aria-label="Yangilash"><span className={ordersLoading?'spin-icon':''}><Icon name="refresh" size={20} /></span></button></header>
      {confirmation && <div className="banner banner-success" role="status"><Icon name="check" size={20} stroke={2.2} /><div><strong>Buyurtma qabul qilindi</strong>Raqami: <span className="num">{confirmation}</span>. Holati va toʻlovini shu yerda kuzatishingiz mumkin.</div></div>}
      {orderError && <div className="banner banner-error" role="alert"><Icon name="alert" size={20} /><div>{orderError}<br /><button className="btn btn-sm btn-secondary" onClick={() => refreshOrders()}>Qayta urinish</button></div></div>}
      {!orderList.length && <EmptyState icon="receipt" title="Hali buyurtma yoʻq" text="Birinchi buyurtmangizni bering — holati shu yerda koʻrinadi." action={<button className="btn btn-primary" onClick={() => go('catalog')}>Katalogga oʻtish</button>} />}
      <div className="order-list">{orderList.map(({id,order,saved}) => { const stage=order?.stage||order?.status; const trackable=order && ['assigned','courier_accepted','picked_up','on_the_way','arrived','delivered_pending_confirmation','disputed'].includes(order.stage); const reviewable=order && order.canReview && (order.items.some(i => !order.reviewed.products.includes(i.productId)) || (order.reviewed.courierRatable && !order.reviewed.courier)); return <article className="order-card" key={id}>
        <div className="order-top"><div><span className="t-caption">Buyurtma{order?.fulfillment==='pickup' ? ' · olib ketish' : ''}</span><strong className="num order-no">{order?.orderNumber||saved?.orderNumber}</strong></div>{order && stage ? <span className={`badge badge-${order.fulfillment==='pickup' ? (order.status==='shipped' ? 'confirmed' : order.status) : stageBadge[stage]||order.status}`}>{order.fulfillment==='pickup' ? pickupNames[order.status]||order.status : stageNames[stage]||statusNames[order.status]||order.status}</span> : orderError && !ordersLoading ? <span className="t-caption">Yuklanmadi</span> : <span className="skeleton" style={{width:84,height:24,borderRadius:99}} />}</div>
        {order ? <>
          <span className="t-caption">{formatDateTime(order.createdAt)}</span>
          <ul className="order-items">{order.items.map((item,i) => <li key={i}><span>{item.name}</span><span className="num">× {item.quantity}</span></li>)}</ul>
          {!!order.deliveryFee && <div className="order-fee"><span>Yetkazib berish</span><span className="num">{money(order.deliveryFee)}</span></div>}
          <div className="order-total"><span>Jami</span><strong className="num">{money(order.total)}</strong></div>
          {order.payment && <div className="order-pay">
            <div className="pay-line"><span className="t-caption"><Icon name={paymentIcons[order.payment.method]||'wallet'} size={15} /> {paymentMethodNames[order.payment.method]||order.payment.method}</span><span className={`badge plain badge-${paymentStatusBadge[order.payment.status]||'new'}`}>{paymentStatusNames[order.payment.status]||order.payment.status}</span></div>
            {order.payment.note && <p className="t-caption">Sabab: {order.payment.note}</p>}
            {order.payment.bankTransferDetails && <><p className="t-caption">Quyidagi rekvizitlarga <b className="num">{money(order.total)}</b> oʻtkazing, izohga buyurtma raqamini yozing:</p><div className="pay-details">{order.payment.bankTransferDetails}</div></>}
            {order.payment.canClaimTransfer && <button className="btn btn-sm btn-secondary" disabled={paying===order.id} onClick={() => claimTransfer(order)}><Icon name="check" size={16} />Pulni oʻtkazdim</button>}
            {order.payment.canPayOnline && <button className="btn btn-sm btn-primary" disabled={paying===order.id} onClick={() => payOnline(order)}>{paying===order.id ? <span className="spinner" /> : <Icon name="wallet" size={16} />}{order.payment.status==='verifying' ? 'Toʻlov sahifasini qayta ochish' : `${paymentMethodNames[order.payment.method]} orqali toʻlash`}</button>}
          </div>}
          {order.canConfirm && <ConfirmDelivery busy={orderBusy===order.id} onConfirm={() => confirmOrder(order)} onDispute={reason => disputeOrder(order,reason)} />}
          {order.stage==='disputed' && <div className="banner banner-warning"><Icon name="alert" size={20} /><div>Xabaringiz doʻkonga yuborildi. Administrator tekshirib, siz bilan bogʻlanadi.</div></div>}
          {(trackable || reviewable) && <div className="order-actions">
            {trackable && <button className="btn btn-sm btn-secondary" onClick={() => setTracking(order)}><Icon name="map" size={16} />Kuzatish</button>}
            {reviewable && <button className="btn btn-sm btn-primary" onClick={() => setReviewing(order)}><Icon name="star" size={16} />Baholash</button>}
          </div>}
        </> : !orderError && <div aria-hidden="true"><div className="skeleton" style={{height:12,width:'40%',marginTop:4}} /><div className="skeleton" style={{height:12,width:'75%',marginTop:14}} /></div>}
      </article>; })}</div>
    </div>;
  } else {
    screen = <div className="screen">
      <header className="page-head"><h1 className="t-h1">Profil</h1></header>
      {accountError && <div className="banner banner-error" role="alert"><Icon name="alert" size={20} /><div>{accountError}</div></div>}
      {customer ? <section className="panel account-panel">
        <div className="account-row"><span className="avatar" aria-hidden="true">{(customer.name||'?').slice(0,1).toUpperCase()}</span><div><strong>{customer.name||'Mijoz'}</strong><span className="t-caption num">{customer.phone ? <>{customer.phone}{customer.phoneVerified && <span className="verified"><Icon name="shield" size={13} />tasdiqlangan</span>}</> : 'Telefon tasdiqlanmagan'}</span>{customer.telegram && <span className="t-caption">Telegram{customer.telegram.username ? ` · @${customer.telegram.username}` : ''}</span>}{customer.email && <span className="t-caption">{customer.email}</span>}</div></div>
        <div className="info-rows">
          {!customer.phoneVerified && <button className="info-row as-btn" onClick={() => setLinkPhone(true)}><Icon name="phone" size={20} /><div><span>Telefonni tasdiqlash</span><span className="t-caption">SMS kod bilan</span></div><Icon name="chevron" size={18} /></button>}
          {!customer.telegram && authConfig?.telegram.enabled && <button className="info-row as-btn" onClick={() => authConfig && startTelegram('link',authConfig)}><Icon name="send" size={20} /><div><span>Telegramni bogʻlash</span><span className="t-caption">Keyingi safar Telegram orqali kirish</span></div><Icon name="chevron" size={18} /></button>}
          {bio==='available' && <label className="info-row as-btn toggle-row"><Icon name="fingerprint" size={20} /><div><span>Barmoq izi bilan kirish</span><span className="t-caption">Sessiya telefon xavfsiz xotirasida shifrlanadi</span></div><input type="checkbox" checked={localStorage.getItem(BIO_FLAG)==='1'} onChange={toggleBiometric} /></label>}
          {bio==='none' && <div className="info-row"><Icon name="fingerprint" size={20} /><div><span>Barmoq izi</span><span className="t-caption">Telefon sozlamalarida barmoq izini qoʻshing</span></div></div>}
          <button className="info-row as-btn" onClick={signOut}><Icon name="logout" size={20} /><div><span>Chiqish</span></div><Icon name="chevron" size={18} /></button>
        </div>
      </section> : <section className="panel account-cta">
        <div className="account-row"><span className="empty-icon small"><Icon name="user" size={24} /></span><div><strong>Hisobingizga kiring</strong><span className="t-caption">Buyurtmalaringiz barcha qurilmalarda saqlanadi, yetkazilgandan keyin baho qoldirasiz.</span></div></div>
        {authConfig?.phone.codeLogin ? <div className="cta-stack"><button className="btn btn-primary btn-lg btn-block" onClick={() => setQuickLogin(true)}><Icon name="phone" size={20} />Telefon raqam bilan kirish</button><button className="btn btn-secondary btn-block" onClick={() => setAuthSheet('login')}>Boshqa usullar: parol, email</button></div>
          : <div className="cta-row"><button className="btn btn-primary" onClick={() => setAuthSheet('login')}>Kirish</button><button className="btn btn-secondary" onClick={() => setAuthSheet('register')}>Roʻyxatdan oʻtish</button></div>}
        {authConfig?.telegram.enabled && <button className="btn btn-telegram btn-block" onClick={() => authConfig && startTelegram('login',authConfig)}><Icon name="send" size={18} />Telegram orqali kirish</button>}
        <p className="t-caption">Hisobsiz ham buyurtma berishingiz mumkin.</p>
      </section>}
      <div className="profile-card"><div className="avatar" aria-hidden="true">{profile.customerName.trim() ? profile.customerName.trim().slice(0,1).toUpperCase() : <Icon name="user" size={26} />}</div><div><strong>{profile.customerName.trim() || 'Ismingizni kiriting'}</strong><span className="t-caption num">{profile.phone.length>4 ? profile.phone : 'Telefon raqami kiritilmagan'}</span></div></div>
      <section className="panel"><SectionHeader title="Yetkazib berish maʼlumotlari" /><p className="t-caption panel-note">Maʼlumotlar faqat shu telefonda saqlanadi va buyurtma berishda avtomatik toʻldiriladi.</p><div className="form-stack">{profileFields(false)}</div></section>
      <section className="panel"><SectionHeader title="Koʻrinish" /><div className="themes" role="radiogroup" aria-label="Rang mavzusi">{Object.entries(themes).map(([key,t]) => <button key={key} role="radio" aria-checked={theme===key} className={`theme-opt${theme===key?' active':''}`} onClick={() => setTheme(key)}><span className="swatch" style={{background:`linear-gradient(135deg, ${t.swatch[0]} 0 50%, ${t.swatch[1]} 50% 100%)`}}>{theme===key && <Icon name="check" size={16} stroke={2.6} />}</span><span>{t.label}</span></button>)}</div></section>
      <section className="panel"><SectionHeader title="Doʻkon bilan aloqa" /><div className="info-rows">{storefront?.store.configured && <button className="info-row as-btn" onClick={() => setStoreOpen(true)}><Icon name="store" size={20} /><div><span className="t-caption">Doʻkon manzili</span><span>{storefront.store.address||storefront.store.name}</span></div><Icon name="chevron" size={18} /></button>}<div className="info-row"><Icon name="phone" size={20} /><div><span className="t-caption">Telefon</span><span className="num">{settings.contact_phone||'Aloqa raqami kiritilmagan'}</span></div></div>{settings.delivery_info && <div className="info-row"><Icon name="truck" size={20} /><div><span className="t-caption">Yetkazib berish</span><span>{settings.delivery_info}</span></div></div>}</div></section>
      {debug && <section className="panel"><SectionHeader title="Texnik sozlamalar" /><p className="t-caption panel-note">Faqat sinov (debug) ilovasida koʻrinadi.</p><div className="info-rows"><button className="info-row as-btn" onClick={openApiSettings}><Icon name="server" size={20} /><div><span>Server (API) manzili</span><span className="t-caption">Server manzilini oʻzgartirish</span></div><Icon name="chevron" size={18} /></button><button className="info-row as-btn" onClick={nativeReload}><Icon name="refresh" size={20} /><div><span>Ilovani qayta yuklash</span><span className="t-caption">Serverdan maʼlumotlarni qaytadan olish</span></div><Icon name="chevron" size={18} /></button></div></section>}
      <p className="t-caption app-version">Fayz Market V1 · versiya {import.meta.env.VITE_APP_VERSION}</p>
    </div>;
  }

  const navItems: [Tab,string,'home'|'grid'|'bag'|'receipt'|'user'][] = [['home','Bosh sahifa','home'],['catalog','Katalog','grid'],['cart','Savat','bag'],['orders','Buyurtmalar','receipt'],['profile','Profil','user']];
  const showHeader = !selected && tab==='home';
  return <div className={`app${selected||(tab==='cart'&&cartItems.length)?' has-action':''}`}>
    {showHeader && <header className="app-header"><div className="brand"><BrandMark size={40} brand={brand} dark={dark} /><div><strong>{brand.name}</strong><span>{brand.tagline || storefront?.store.address || 'Fayz Market'}</span></div></div><button className="icon-btn header-go" onClick={() => setStoreOpen(true)} aria-label="Doʻkonga yoʻl — xaritada"><Icon name="directions" size={24} /></button></header>}
    <main key={selected ? 'p'+selected.id : tab} className="main">{screen}</main>
    <nav className="tabbar" aria-label="Asosiy menyu"><div className="tabbar-inner">{navItems.map(([key,label,icon]) => { const current = tab===key && !selected; return <button key={key} className={current?'current':''} aria-current={current?'page':undefined} aria-label={key==='cart' ? `Savat, ${cartCount} ta mahsulot` : undefined} onClick={() => go(key)}><span className="tab-icon"><Icon name={icon} size={22} stroke={current?2:1.8} />{key==='cart' && cartCount>0 && <span className="tab-badge num">{cartCount>99?'99+':cartCount}</span>}</span><span className="tab-label">{label}</span></button>; })}</div></nav>
    {checkout && <Sheet title="Buyurtmani rasmiylashtirish" onClose={closeCheckout} footer={<><button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={submitting}>{submitting ? <><span className="spinner" />Yuborilmoqda...</> : <>Buyurtmani yuborish<span className="btn-total num">{money(cartTotal+feeFor(pickup))}</span></>}</button><button className="btn btn-quiet btn-block" onClick={closeCheckout} disabled={submitting}>Bekor qilish</button></>}>
      <div className="co-summary"><div className="co-items">{cartItems.map(({product,quantity:count}) => <div key={product.id} className="co-item"><span className="co-thumb"><ProductImage src={product.images[0]} /></span><span className="co-name">{product.name}<span className="t-caption num"> × {count}</span></span><span className="num">{money(product.price*count)}</span></div>)}</div>{(feeRule.fee>0 || pickup) && <div className="co-lines"><div><span>Mahsulotlar</span><span className="num">{money(cartTotal)}</span></div><div><span>{pickup ? 'Olib ketish' : 'Yetkazib berish (kuryer)'}</span><span className="num">{feeFor(pickup) ? money(feeFor(pickup)) : 'bepul'}</span></div></div>}<div className="summary-total"><span>Jami</span><strong className="num">{money(cartTotal+feeFor(pickup))}</strong></div></div>
      {checkoutError && <div className="banner banner-error" role="alert"><Icon name="alert" size={20} /><div>{checkoutError}</div></div>}
      {pickupOffered && <div className="form-stack"><h3 className="t-h2">Qabul qilish usuli</h3>
        <div className="segmented" role="group" aria-label="Qabul qilish usuli"><button type="button" aria-pressed={!pickup} onClick={() => setFulfillment('delivery')}><Icon name="truck" size={18} />Yetkazib berish</button><button type="button" aria-pressed={pickup} onClick={() => setFulfillment('pickup')}><Icon name="store" size={18} />Doʻkondan olib ketish</button></div>
      </div>}
      {pickup ? <div className="form-stack"><h3 className="t-h2">Olib ketish manzili</h3>
        <div className="loc-summary"><Icon name="store" size={20} /><div><strong>{storefront?.store.name||'Fayz Market'}</strong><span className="t-caption">{checkoutOptions?.pickupAddress||storefront?.store.address}</span></div><button className="link-btn" onClick={() => setStoreOpen(true)}>Xaritada</button></div>
        <p className="t-caption">Buyurtma tayyor boʻlganda holati «Olib ketishga tayyor» boʻladi.</p>
      </div> : <div className="form-stack"><h3 className="t-h2">Yetkazish joyi</h3>
        {dropoff ? <><div className="loc-summary"><Icon name="pin" size={20} /><div><strong>{dropoff.address || (dropoff.accuracy ? 'Joriy joylashuvingiz (GPS)' : 'Xaritada belgilangan nuqta')}</strong><span className="t-caption num">{formatCoords(dropoff)}{dropoff.accuracy ? ` · ±${dropoff.accuracy} m` : ''}</span></div><button className="link-btn" onClick={() => setLocationSheet(true)}>Oʻzgartirish</button></div><p className="t-caption">Kuryer shu nuqtaga keladi va yetib kelganda sizga qoʻngʻiroq qiladi.</p></>
          : <div className="loc-choice"><button className="btn btn-primary btn-block loc-btn" onClick={locateDropoff} disabled={locatingDrop}>{locatingDrop ? <><span className="spinner" />Aniqlanmoqda...</> : <><Icon name="target" size={20} />Joylashuvimni aniqlash (GPS)</>}</button><button className="btn btn-secondary btn-block loc-btn" onClick={() => setLocationSheet(true)}><Icon name="map" size={20} />Xaritada tanlash</button><p className="t-caption">Ixtiyoriy, lekin kuryer sizni tezroq topadi. Manzilni pastda matn bilan ham yozing.</p></div>}
        <Field label="Podyezd, qavat, moʻljal" hint="Ixtiyoriy — kuryerga yordam beradi"><input className="input" value={deliveryDetails} maxLength={300} onChange={e => setDeliveryDetails(e.target.value)} onFocus={revealOnFocus} placeholder="Masalan: 3-podyezd, 5-qavat, doʻkon yonida" /></Field>
      </div>}
      <div className="form-stack"><h3 className="t-h2">Toʻlov usuli</h3>
        <div className="choice-list" role="radiogroup" aria-label="Toʻlov usuli">{payOptions.map(o => <button type="button" key={o.method} role="radio" aria-checked={paymentMethod===o.method} className="choice" onClick={() => setPaymentMethod(o.method)}><span className="choice-icon"><Icon name={paymentIcons[o.method]||'wallet'} size={20} /></span><span className="choice-body"><strong>{o.label}</strong><span>{paymentHints[o.method]?.(pickup)||''}</span></span><span className="choice-radio" aria-hidden="true" /></button>)}</div>
        <p className="t-caption">Buyurtma yuborilgani toʻlov qilingani emas: toʻlov doʻkon yoki toʻlov tizimi tasdiqlagandan keyin «Toʻlandi» boʻladi.</p>
      </div>
      <div className="form-stack"><h3 className="t-h2">Qabul qiluvchi</h3>{profileFields(true,!pickup)}<Field label="Izoh" hint="Ixtiyoriy: qulay vaqt va boshqalar"><textarea className="input" value={note} onChange={e => setNote(e.target.value)} onFocus={revealOnFocus} /></Field></div>
    </Sheet>}
    {storeOpen && <StoreScreen api={api} storefront={storefront} user={userLocation} onUser={l => setUserLocation(l as UserLocation|null)} mapsKey={mapsKey} onClose={() => setStoreOpen(false)} />}
    {userSheet && <LocationSheet apiKey={mapsKey} title="Sizning joylashuvingiz" hint="GPS bilan aniqlang yoki xaritani surib nuqtani qoʻlda tanlang. Joylashuv faqat shu telefonda saqlanadi." notice={userSheet.notice} initial={userLocation ? {lat:userLocation.lat,lng:userLocation.lng,accuracy:userLocation.accuracy,address:userLocation.address} : null} onClose={() => setUserSheet(null)} onConfirm={l => { setUserLocation({lat:l.lat,lng:l.lng,accuracy:l.accuracy,address:l.address||undefined,source:l.accuracy ? 'gps' : 'manual',at:Date.now()}); setUserSheet(null); }} />}
    {locationSheet && <LocationSheet apiKey={mapsKey} initial={dropoff ?? (userLocation ? {lat:userLocation.lat,lng:userLocation.lng,accuracy:userLocation.accuracy} : null)} onClose={() => setLocationSheet(false)} onConfirm={l => { setDropoff(l); setLocationSheet(false); if(l.address && profile.address.trim().length<5) setProfile(old => ({...old,address:l.address!})); }} />}
    {quickLogin && <PhoneLoginSheet api={api} config={authConfig} onDone={signIn} onClose={() => setQuickLogin(false)} onOther={() => { setQuickLogin(false); setAuthSheet('login'); }} />}
    {authSheet && <AuthSheet api={api} config={authConfig} initialMode={authSheet} onDone={signIn} onClose={() => setAuthSheet(null)} />}
    {linkPhone && <LinkPhoneSheet api={api} config={authConfig} onClose={() => setLinkPhone(false)} onDone={who => { setCustomer(who); setLinkPhone(false); setToast({message:'Telefon tasdiqlandi'}); }} />}
    {tracking && <TrackingSheet api={api} order={tracking} headers={orderHeaders(tracking.id)} apiKey={mapsKey} onClose={() => setTracking(null)} onChanged={() => refreshOrders(true)} />}
    {reviewing && <ReviewSheet api={api} order={reviewing} headers={orderHeaders(reviewing.id)} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); setToast({message:'Rahmat! Bahoyingiz saqlandi'}); void refreshOrders(true); }} />}
    {locked && <div className="lock-screen" role="dialog" aria-modal="true" aria-label="Ilova qulflangan">
      <BrandMark size={72} brand={brand} dark={dark} /><h1 className="t-h1">{brand.name}</h1><p className="t-body t-muted">Hisobingiz barmoq izi bilan himoyalangan</p>
      {accountError && <div className="banner banner-error"><Icon name="alert" size={20} /><div>{accountError}</div></div>}
      {/* Once the Keystore key is invalidated the flag is gone: only the password route can work. */}
      {localStorage.getItem(BIO_FLAG)==='1'
        ? <><button className="btn btn-primary btn-lg btn-block" onClick={unlock}><Icon name="fingerprint" size={22} />Barmoq izi bilan ochish</button>
          <button className="btn btn-quiet btn-block" onClick={() => { setLocked(false); setAuthSheet('login'); }}>Parol bilan kirish</button></>
        : <button className="btn btn-primary btn-lg btn-block" onClick={() => { setLocked(false); setAuthSheet('login'); }}>Parol bilan kirish</button>}
      <button className="link-btn" onClick={() => setLocked(false)}>Hisobsiz davom etish</button>
    </div>}
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
