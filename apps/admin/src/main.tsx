import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Category, Product } from '@fayz/shared';
import { money } from '@fayz/shared';
import { Icon, type IconName } from '../../../packages/ui/src/Icon';
import { BrandMark, useBrand } from '../../../packages/ui/src/brand';
import { paymentMethodNames, paymentStatusBadge, paymentStatusNames } from '../../../packages/ui/src/storefront';
import { BannersView, BrandPanel, OrderPayment, PaymentSettingsPanel, StorePanel, ThemePanel, useAdminTheme, type PaymentRow } from './storefront-admin';
import { NETWORK_MESSAGE, formatDateTime, formatDay, friendlyError, nativeDebug, openApiSettings, paintSystemBars } from '../../../packages/ui/src/format';
import { ConfirmDialog, EmptyState, Field, IconAction, MetricCard, Modal, Panel, Thumb, Toggle } from './components';
import { CourierApp } from './courier';
import { ImagePicker, IntegrationsView, OrderDelivery, PasswordPanel, ReviewsView, StaffPanel, roleNames as staffRoles, useNotifications, type Notice, type OrderExtras } from './expansion';
import { biometricDisable, biometricEnable, biometricStatus, biometricStored, biometricUnlock, desktopSession } from '../../../packages/ui/src/native';
import { deliveryNames } from '../../../packages/ui/src/stages';
import '../../../packages/ui/src/tokens.css';
import '../../../packages/ui/src/expansion.css';
import '../../../packages/ui/src/storefront.css';
import './style.css';

declare global { interface Window { fayzDesktop?: { request: (input: { path: string; method: string; authorization?: string; contentType?: string; body?: string | Uint8Array }) => Promise<{ status: number; data: any }>; notify?: (input: { title: string; body: string; orderId?: number }) => void; saveSession?: (token: string) => Promise<boolean>; loadSession?: () => Promise<string>; clearSession?: () => Promise<void>; onOpenOrder?: (cb: (id: number) => void) => void } } }

const API = import.meta.env.VITE_API_URL || (window.location.pathname.startsWith('/__app/') ? window.location.origin : 'http://localhost:8787');
type View = 'dashboard' | 'products' | 'categories' | 'orders' | 'banners' | 'reviews' | 'settings' | 'integrations';
type Order = { id: number; orderNumber: string; customerName: string; phone: string; address: string; status: string; total: number; createdAt: string; items: { name: string; price: number; quantity: number }[]; location: { lat: number; lng: number; details: string } | null; deliveryStatus?: string | null; courierName?: string | null; fulfillment?: string; paymentMethod?: string; paymentStatus?: string; paidAt?: string | null; paymentNote?: string };
type Me = { id: number; email: string; role: string; name: string };
const BIO_FLAG = 'fayz_admin_bio';
type Report = { orders: { orders: number; ordered_total: number; delivered_total: number }; payments: { received_total: number; verifying?: number }; inventory: { products: number; units: number }; daily: { day: string; orders: number; total: number }[] };
const statusNames: Record<string, string> = { new: 'Yangi', confirmed: 'Tasdiqlangan', preparing: 'Tayyorlanmoqda', shipped: 'Yoʻlda', delivered: 'Yetkazildi', cancelled: 'Bekor qilingan' };
const pickupStatusNames: Record<string, string> = { shipped: 'Olib ketishga tayyor', delivered: 'Topshirildi' };
const paymentFilters: [string, string][] = [['', 'Hammasi'], ['pending', 'Kutilmoqda'], ['verifying', 'Tekshirilmoqda'], ['paid', 'Toʻlangan'], ['failed', 'Muvaffaqiyatsiz']];
const roleNames: Record<string, string> = staffRoles;
const emptyProduct = { name: '', slug: '', description: '', categoryId: 0, price: 0, stock: 0, active: true, featured: false, images: [] as string[] };
const views: [View, string, IconName, string][] = [
  ['dashboard', 'Boshqaruv', 'chart', 'Savdo va ombor holati'],
  ['products', 'Mahsulotlar', 'box', 'Katalog, narx va qoldiq'],
  ['categories', 'Kategoriyalar', 'layers', 'Katalog boʻlimlari'],
  ['orders', 'Buyurtmalar', 'receipt', 'Holat, kuryer va toʻlovlar'],
  ['banners', 'Bannerlar', 'image', 'Bosh sahifadagi reklama va eʼlonlar'],
  ['reviews', 'Sharhlar', 'star', 'Mijoz baholari va moderatsiya'],
  ['settings', 'Sozlamalar', 'settings', 'Brend, doʻkon, toʻlov, xodimlar'],
  ['integrations', 'Integratsiyalar', 'plug', 'Toʻlov, xarita, SMS, Telegram, push'],
];
const nextStatuses: Record<string, string[]> = { new: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['shipped', 'cancelled'], shipped: ['delivered'] };
type Confirmation = { title: string; text: string; label: string; run: () => void };

function App() {
  const [token, setToken] = useState(sessionStorage.getItem('fayz_admin_token') || '');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [view, setView] = useState<View>('dashboard'); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]); const [categories, setCategories] = useState<Category[]>([]); const [orders, setOrders] = useState<Order[]>([]); const [report, setReport] = useState<Report | null>(null);
  const [product, setProduct] = useState<typeof emptyProduct & { id?: number }>(emptyProduct); const [editingProduct, setEditingProduct] = useState(false);
  const [category, setCategory] = useState({ id: 0, name: '', slug: '' }); const [selectedOrder, setSelectedOrder] = useState<Order | null>(null); const [payments, setPayments] = useState<PaymentRow[]>([]); const [transactions, setTransactions] = useState<any[]>([]);
  const [paymentFilter, setPaymentFilter] = useState('');
  const [adjust, setAdjust] = useState({ id: 0, delta: 0, reason: '' });
  const [settings, setSettings] = useState({ contact_phone: '', delivery_info: '', banner_title: '', banner_subtitle: '' }); const [role, setRole] = useState('manager');
  const [users, setUsers] = useState<{ id: number; email: string; role: string }[]>([]);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'manager' });
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  // UI-only state
  const [menuOpen, setMenuOpen] = useState(false); const [confirmBox, setConfirmBox] = useState<Confirmation | null>(null); const [loaded, setLoaded] = useState<View | ''>('');
  const debug = useMemo(nativeDebug, []);
  // V1 expansion: role-aware shell, delivery data, notifications, persistent/biometric sessions.
  const [me, setMe] = useState<Me | null>(null); const [extras, setExtras] = useState<OrderExtras | null>(null);
  const [publicSettings, setPublicSettings] = useState<Record<string, string>>({}); const [notices, setNotices] = useState<Notice[]>([]);
  const mapsKey = publicSettings.google_maps_key || '';
  const [themeMode, setThemeMode, darkTheme] = useAdminTheme();
  const brand = useBrand(publicSettings.store_name !== undefined ? { name: publicSettings.store_name || 'Fayz Market', tagline: publicSettings.brand_tagline ?? '', logoLight: publicSettings.brand_logo_light || '', logoDark: publicSettings.brand_logo_dark || '' } : null);
  const loadPublic = () => request<{ settings: Record<string, string> }>('/settings').then(r => setPublicSettings(r.settings)).catch(() => undefined);
  const [locked, setLocked] = useState(() => !sessionStorage.getItem('fayz_admin_token') && localStorage.getItem(BIO_FLAG) === '1' && biometricStored());
  const [bioOn, setBioOn] = useState(() => localStorage.getItem(BIO_FLAG) === '1');
  const bio = useMemo(biometricStatus, []);
  useEffect(() => { paintSystemBars(); }, [darkTheme]);
  useEffect(() => { void loadPublic(); }, []);
  useEffect(() => { if (!token && desktopSession.available()) void desktopSession.load().then(saved => { if (saved) { sessionStorage.setItem('fayz_admin_token', saved); setToken(saved); } }); }, []);
  useEffect(() => {
    if (!token) { setMe(null); return; }
    request<{ admin: Me }>('/admin/me').then(r => { setMe(r.admin); setRole(r.admin.role); }).catch(e => { if (/Sessiya|kirishi kerak/.test(String(e?.message))) { sessionStorage.removeItem('fayz_admin_token'); void desktopSession.clear(); setToken(''); } else setError(friendlyError(e)); });
    void loadPublic();
  }, [token]);
  // Tapping a system notification (Android shell / desktop) opens that order.
  useEffect(() => {
    const open = (e: Event) => { const id = Number((e as CustomEvent).detail); if (id && me && me.role !== 'courier') { setView('orders'); openOrder(id); } };
    window.addEventListener('fayz-open-order', open); window.fayzDesktop?.onOpenOrder?.(id => window.dispatchEvent(new CustomEvent('fayz-open-order', { detail: id })));
    return () => window.removeEventListener('fayz-open-order', open);
  }, [me]);
  useNotifications(request, me ? `staff-${me.id}` : 'staff', !!me && me.role !== 'courier', fresh => setNotices(old => [...fresh, ...old].slice(0, 5)));
  const unlock = async () => {
    setError(''); const r = await biometricUnlock();
    if (r.ok) { sessionStorage.setItem('fayz_admin_token', r.value); setToken(r.value); setLocked(false); return; }
    // New fingerprints on the phone permanently invalidate the Keystore key: fall back to the password form.
    if (r.value === 'invalidated' || r.value === 'empty') { localStorage.removeItem(BIO_FLAG); setLocked(false); setError('Telefonda barmoq izlari oʻzgargani uchun bu usul oʻchirildi. Parol bilan kiring va uni qayta yoqing.'); return; }
    if (r.value !== 'cancelled') setError('Barmoq izi tasdiqlanmadi');
  };
  const toggleBio = async () => { if (bioOn) { biometricDisable(); localStorage.removeItem(BIO_FLAG); setBioOn(false); return; } const r = await biometricEnable(token); if (r.ok) { localStorage.setItem(BIO_FLAG, '1'); setBioOn(true); setMessage('Barmoq izi bilan kirish yoqildi'); } else setError('Barmoq izini yoqib boʻlmadi'); };
  const securityPanel = bio === 'unsupported' ? null : <Panel title="Xavfsizlik" subtitle="Ushbu telefon uchun"><Toggle label="Barmoq izi bilan kirish" hint={bio === 'none' ? 'Avval telefon sozlamalarida barmoq izini qoʻshing' : 'Sessiya Android Keystore’da shifrlanadi; ilova ochilganda barmoq izi soʻraladi'} checked={bioOn} onChange={() => { if (bio === 'available') void toggleBio(); }} /></Panel>;
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    if (window.fayzDesktop) {
      const result = await window.fayzDesktop.request({ path, method: init?.method || 'GET', authorization: token ? `Bearer ${token}` : undefined, contentType: 'application/json', body: typeof init?.body === 'string' ? init.body : undefined });
      if (result.status < 200 || result.status >= 300) throw new Error(result.data.error?.message || 'Server xatosi');
      return result.data as T;
    }
    let response: Response;
    try { response = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } }); }
    catch { throw new Error(NETWORK_MESSAGE); }
    let data: any;
    try { data = await response.json(); } catch { throw new Error(`Server javobi oʻqilmadi (${response.status})`); }
    if (!response.ok) throw new Error(data.error?.message || 'Server xatosi');
    return data;
  }
  async function execute(task: () => Promise<unknown>, success = 'Saqlandi') { setBusy(true); setError(''); setMessage(''); try { await task(); setMessage(success); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } }
  async function load(target: View = view, p = page) {
    const [cats, me] = await Promise.all([request<{ categories: Category[] }>('/categories'), request<{ admin: { role: string } }>('/admin/me')]); setCategories(cats.categories); setRole(me.admin.role);
    if (target === 'dashboard') setReport(await request<Report>('/admin/reports/summary'));
    if (target === 'products') { const data = await request<{ products: Product[]; total: number }>(`/admin/products?page=${p}`); setProducts(data.products); setTotal(data.total); }
    if (target === 'orders') { const data = await request<{ orders: Order[]; total: number }>(`/admin/orders?page=${p}${paymentFilter ? `&payment=${paymentFilter}` : ''}`); setOrders(data.orders); setTotal(data.total); }
    if (target === 'settings') { const data = await request<{ settings: typeof settings }>('/settings'); setSettings(data.settings); if (me.admin.role === 'owner') { const userData = await request<{ users: typeof users }>('/admin/users'); setUsers(userData.users); } }
    setLoaded(target);
  }
  useEffect(() => { if (token && me && me.role !== 'courier') execute(() => load(view, page), ''); }, [token, view, page, me, paymentFilter]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3200); return () => clearTimeout(timer); }, [message]);
  const changeView = (next: View) => { setPage(1); setView(next); setError(''); setMessage(''); setMenuOpen(false); setLoaded(''); window.scrollTo({ top: 0 }); };
  const login = (event: React.FormEvent) => { event.preventDefault(); execute(async () => { const data = await request<{ token: string }>('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }); sessionStorage.setItem('fayz_admin_token', data.token); if (desktopSession.available()) await desktopSession.save(data.token); if (localStorage.getItem(BIO_FLAG) === '1' && biometricStored()) await biometricEnable(data.token); setToken(data.token); setPassword(''); }, ''); };
  const logout = () => execute(async () => { try { await request('/admin/logout', { method: 'POST' }); } finally { sessionStorage.removeItem('fayz_admin_token'); await desktopSession.clear(); biometricDisable(); localStorage.removeItem(BIO_FLAG); setBioOn(false); setMe(null); setToken(''); } }, '');
  const saveProduct = (event: React.FormEvent) => { event.preventDefault(); execute(async () => { await request(product.id ? `/admin/products/${product.id}` : '/admin/products', { method: product.id ? 'PUT' : 'POST', body: JSON.stringify(product) }); setEditingProduct(false); setProduct(emptyProduct); await load('products'); }); };
  /** Uploads a prepared photo to R2 (via the Worker) with progress; the URL is added to the product form. */
  const upload = async (path: string, blob: Blob, progress: (p: number) => void = () => undefined) => {
    const type = blob.type || 'image/jpeg';
    const result: { status: number; data: any } = window.fayzDesktop
      ? (progress(30), await window.fayzDesktop.request({ path, method: 'POST', authorization: `Bearer ${token}`, contentType: type, body: new Uint8Array(await blob.arrayBuffer()) }))
      : await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest(); xhr.open('POST', API + path); xhr.setRequestHeader('Authorization', `Bearer ${token}`); xhr.setRequestHeader('Content-Type', type);
        xhr.upload.onprogress = e => { if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => { try { resolve({ status: xhr.status, data: JSON.parse(xhr.responseText) }); } catch { reject(new Error(`Server javobi oʻqilmadi (${xhr.status})`)); } };
        xhr.onerror = () => reject(new Error(NETWORK_MESSAGE)); xhr.send(blob);
      });
    if (result.status < 200 || result.status >= 300) throw new Error(result.data.error?.message || 'Rasm yuklanmadi');
    progress(100);
    return result.data;
  };
  const uploadImage = async (blob: Blob, progress: (p: number) => void) => {
    const data = await upload('/admin/images', blob, progress);
    setProduct(current => current.images.includes(data.url) ? current : ({ ...current, images: [...current.images, data.url] }));
  };
  const saveCategory = (event: React.FormEvent) => { event.preventDefault(); execute(async () => { await request(category.id ? `/admin/categories/${category.id}` : '/admin/categories', { method: category.id ? 'PUT' : 'POST', body: JSON.stringify({ name: category.name, slug: category.slug }) }); setCategory({ id: 0, name: '', slug: '' }); await load('categories'); }); };
  const openOrder = (id: number) => execute(async () => { const data = await request<{ order: Order; payments: PaymentRow[]; transactions?: any[] } & OrderExtras>(`/admin/orders/${id}`); setSelectedOrder(data.order); setPayments(data.payments); setTransactions(data.transactions || []); setExtras({ delivery: data.delivery, events: data.events, courierLocation: data.courierLocation, courierRating: data.courierRating, reviews: data.reviews }); }, '');
  const status = (next: string) => { if (!selectedOrder) return; execute(async () => { await request(`/admin/orders/${selectedOrder.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); await openOrder(selectedOrder.id); await load('orders'); }); };
  const removeProduct = (p: Product) => setConfirmBox({ title: 'Mahsulotni yashirish', text: `«${p.name}» katalogdan yashiriladi. Mavjud buyurtmalar oʻzgarmaydi.`, label: 'Yashirish', run: () => execute(async () => { await request(`/admin/products/${p.id}`, { method: 'DELETE' }); await load('products'); }) });
  const removeCategory = (cat: Category) => setConfirmBox({ title: 'Kategoriyani oʻchirish', text: `«${cat.name}» kategoriyasi oʻchiriladi.`, label: 'Oʻchirish', run: () => execute(async () => { await request(`/admin/categories/${cat.id}`, { method: 'DELETE' }); await load('categories'); }) });
  const closeProduct = useCallback(() => setEditingProduct(false), []);
  const closeAdjust = useCallback(() => setAdjust({ id: 0, delta: 0, reason: '' }), []);
  const closeOrder = useCallback(() => { setSelectedOrder(null); setExtras(null); }, []);
  const closeConfirm = useCallback(() => setConfirmBox(null), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEffect(() => { if (!menuOpen) return; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [menuOpen, closeMenu]);

  if (!token && locked) return <main className="login-page"><div className="login-card">
    <div className="login-brand"><BrandMark size={56} brand={brand} dark={darkTheme} /><div><h1>{brand.name}</h1><p>Sessiya barmoq izi bilan himoyalangan</p></div></div>
    {error && <div className="banner banner-error" role="alert"><Icon name="alert" size={20} /><div>{error}</div></div>}
    <button className="btn btn-primary btn-lg btn-block" onClick={unlock}><Icon name="fingerprint" size={22} />Barmoq izi bilan ochish</button>
    <button className="btn btn-quiet btn-block" onClick={() => setLocked(false)}>Parol bilan kirish</button>
  </div></main>;
  if (token && !me) return <main className="login-page"><div className="login-card center-card">{error ? <><div className="banner banner-error" role="alert"><Icon name="alert" size={20} /><div>{error}</div></div><button className="btn btn-secondary" onClick={() => { setError(''); const t = token; setToken(''); setTimeout(() => setToken(t)); }}>Qayta urinish</button><button className="btn btn-quiet" onClick={() => { sessionStorage.removeItem('fayz_admin_token'); void desktopSession.clear(); setToken(''); setError(''); }}>Chiqish</button></> : <><span className="spinner" /><span className="t-muted">Yuklanmoqda...</span></>}</div></main>;
  if (token && me?.role === 'courier') return <CourierApp request={request} me={me} onLogout={logout} mapsKey={mapsKey || undefined} securityPanel={securityPanel} />;
  if (!token) return <main className="login-page">
    <form className="login-card" onSubmit={login}>
      <div className="login-brand"><BrandMark size={56} brand={brand} dark={darkTheme} /><div><h1>{brand.name}</h1><p>Boshqaruv paneliga kirish</p></div></div>
      {error && <div className="banner banner-error" role="alert"><Icon name={error === NETWORK_MESSAGE ? 'wifiOff' : 'alert'} size={20} /><div>{error}</div></div>}
      <p className="t-caption">Administratorlar va kuryerlar shu yerdan kiradi.</p>
      <Field label="Email"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" placeholder="admin@fayzmarket.uz" /></Field>
      <Field label="Parol" hint="Kamida 10 ta belgi"><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={10} required autoComplete="current-password" /></Field>
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? <><span className="spinner" />Tekshirilmoqda...</> : 'Kirish'}</button>
      {debug && <button type="button" className="btn btn-quiet btn-block" onClick={openApiSettings}><Icon name="server" size={18} />Server manzili (sinov)</button>}
    </form>
    <p className="login-foot">Fayz Market V1 · versiya {import.meta.env.VITE_APP_VERSION || ''}</p>
  </main>;

  const current = views.find(v => v[0] === view)!;
  const pages = Math.max(1, Math.ceil(total / 20));
  const loading = busy && loaded !== view;
  const retry = <button className="btn btn-sm btn-secondary" onClick={() => execute(() => load(view, page), '')}><Icon name="refresh" size={16} />Qayta urinish</button>;
  const maxDay = Math.max(1, ...(report?.daily.map(d => d.total) || [1]));

  return <div className="shell">
    {busy && <div className="progress" aria-hidden="true" />}
    <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Boʻlimlar">
      <div className="side-brand"><BrandMark size={40} brand={brand} dark={darkTheme} /><div><strong>{brand.name}</strong><span>Boshqaruv paneli</span></div><button className="icon-btn side-close" onClick={closeMenu} aria-label="Menyuni yopish"><Icon name="close" /></button></div>
      <nav className="side-nav">{views.filter(([key]) => (key !== 'integrations' || role === 'owner')).map(([key, label, icon]) => <button key={key} className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => changeView(key)}><Icon name={icon} size={20} /><span>{label}</span></button>)}</nav>
      <div className="side-foot"><div className="side-user"><span className="avatar-sm"><Icon name="user" size={18} /></span><div><span className="t-caption">{me?.name || me?.email || 'Rol'}</span><strong>{roleNames[role] || role}</strong></div></div><button className="btn btn-quiet btn-block" onClick={logout} disabled={busy}><Icon name="logout" size={18} />Chiqish</button></div>
    </aside>
    <div className={`drawer-backdrop${menuOpen ? ' show' : ''}`} data-open={menuOpen} onClick={closeMenu} aria-hidden="true" />
    <div className="content">
      <header className="topbar">
        <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Menyu" aria-expanded={menuOpen}><Icon name="menu" /></button>
        <div className="topbar-title"><h1>{current[1]}</h1><p>{current[3]}</p></div>
        <div className="topbar-actions">
          {view === 'products' && <button className="btn btn-primary" onClick={() => { setProduct(emptyProduct); setEditingProduct(true); }} disabled={busy}><Icon name="plus" size={18} /><span className="hide-xs">Mahsulot qoʻshish</span><span className="visually-hidden show-xs-sr">Mahsulot qoʻshish</span></button>}
          {(view === 'dashboard' || view === 'orders') && <button className="icon-btn filled" onClick={() => execute(() => load(view, page), '')} disabled={busy} aria-label="Yangilash"><Icon name="refresh" size={20} /></button>}
        </div>
      </header>
      {error && !(view === 'settings' && loaded !== 'settings') && <div className="banner banner-error page-banner" role="alert"><Icon name={error === NETWORK_MESSAGE ? 'wifiOff' : 'alert'} size={20} /><div><strong>{error === NETWORK_MESSAGE ? 'Aloqa yoʻq' : 'Amal bajarilmadi'}</strong>{error}<div className="banner-actions">{retry}{debug && error === NETWORK_MESSAGE && <button className="btn btn-sm btn-secondary" onClick={openApiSettings}><Icon name="server" size={16} />Server manzili</button>}</div></div></div>}
      {notices.length > 0 && <div className="notice-stack">{notices.slice(0, 3).map(n => <div key={n.id} className="banner banner-info notice" role="status"><Icon name="bell" size={20} /><div><strong>{n.title}</strong>{n.body}<div className="banner-actions">{n.orderId && <button className="btn btn-sm btn-primary" onClick={() => { setNotices(old => old.filter(x => x.id !== n.id)); openOrder(n.orderId!); }}>Ochish</button>}<button className="btn btn-sm btn-secondary" onClick={() => setNotices(old => old.filter(x => x.id !== n.id))}>Yopish</button></div></div></div>)}</div>}
      <main className="view" key={view}>

        {view === 'dashboard' && <>
          <div className="metrics">
            <MetricCard icon="receipt" label="Buyurtmalar" loading={!report} value={report?.orders.orders ?? '—'} caption="Barcha holatlar" />
            <MetricCard icon="tag" label="Buyurtma summasi" loading={!report} value={report ? money(report.orders.ordered_total) : '—'} caption={report ? <>Yetkazilgan: <span className="num">{money(report.orders.delivered_total)}</span></> : 'Bekor qilinganlarsiz'} />
            <MetricCard icon="wallet" label="Qabul qilingan toʻlov" loading={!report} value={report ? money(report.payments.received_total) : '—'} caption={report?.payments.verifying ? <>Tekshirilmoqda: <span className="num">{report.payments.verifying}</span> ta buyurtma</> : 'Qayd etilgan va onlayn tasdiqlangan'} />
            <MetricCard icon="box" label="Faol mahsulotlar" loading={!report} value={report?.inventory.products ?? '—'} caption={report ? <>Omborda: <span className="num">{report.inventory.units}</span> dona</> : 'Katalogda koʻrinadi'} />
          </div>
          <Panel title="Kunlik savdo" subtitle="Oxirgi 30 kun, bekor qilingan buyurtmalarsiz">
            {report && !report.daily.length ? <EmptyState icon="chart" title="Hali savdo yoʻq" text="Birinchi buyurtma tushganda kunlik savdo shu yerda koʻrinadi." /> :
              <div className="table-wrap flush"><table className="table"><thead><tr><th>Sana</th><th className="r">Buyurtmalar</th><th className="bar-col">Jami</th></tr></thead><tbody>
                {!report && [0, 1, 2].map(i => <tr key={i}><td colSpan={3}><div className="skeleton" style={{ height: 14 }} /></td></tr>)}
                {report?.daily.map(row => <tr key={row.day}><td className="nowrap">{formatDay(row.day)}</td><td className="r num">{row.orders}</td><td className="bar-col"><div className="bar-cell"><span className="bar" style={{ width: `${Math.max(3, (row.total / maxDay) * 100)}%` }} /><span className="num">{money(row.total)}</span></div></td></tr>)}
              </tbody></table></div>}
          </Panel>
        </>}

        {view === 'products' && <>
          <div className="list-meta"><span className="num">{loading ? 'Yuklanmoqda...' : `${total} ta mahsulot`}</span>{pages > 1 && <span className="num">{page}-sahifa</span>}</div>
          {!loading && loaded === 'products' && !products.length ? <Panel><EmptyState icon="box" title="Mahsulot yoʻq" text="Birinchi mahsulotni qoʻshing — u mijoz ilovasida koʻrinadi." action={<button className="btn btn-primary" onClick={() => { setProduct(emptyProduct); setEditingProduct(true); }}><Icon name="plus" size={18} />Mahsulot qoʻshish</button>} /></Panel> : <>
            <div className="table-wrap desktop-only"><table className="table"><thead><tr><th>Mahsulot</th><th className="r">Narx</th><th className="r">Qoldiq</th><th>Holat</th><th className="r">Amallar</th></tr></thead><tbody>
              {loading && !products.length && [0, 1, 2, 3].map(i => <tr key={i}><td colSpan={5}><div className="skeleton" style={{ height: 40 }} /></td></tr>)}
              {products.map(p => <tr key={p.id}><td><div className="prod-cell"><Thumb src={p.images[0]} /><div><strong>{p.name}</strong><span className="t-caption">{p.categoryName}</span></div></div></td><td className="r num nowrap">{money(p.price)}</td><td className={`r num${p.stock ? '' : ' danger-text'}`}>{p.stock}</td><td><div className="badges"><span className={`badge ${p.active ? 'badge-ok' : ''}`}>{p.active ? 'Faol' : 'Yashirin'}</span>{p.featured && <span className="badge badge-confirmed plain">Tanlangan</span>}</div></td><td className="r"><div className="acts">
                <IconAction icon="edit" label="Tahrirlash" onClick={() => { setProduct(p); setEditingProduct(true); }} disabled={busy} compact />
                <IconAction icon="box" label="Qoldiq" onClick={() => setAdjust({ id: p.id, delta: 0, reason: '' })} disabled={busy} compact />
                {p.active && <IconAction icon="trash" label="Oʻchirish" tone="danger" onClick={() => removeProduct(p)} disabled={busy} compact />}
              </div></td></tr>)}
            </tbody></table></div>
            <div className="cards mobile-only">
              {loading && !products.length && [0, 1, 2].map(i => <div key={i} className="m-card"><div className="skeleton" style={{ height: 64 }} /></div>)}
              {products.map(p => <article key={p.id} className="m-card">
                <div className="m-card-top"><Thumb src={p.images[0]} size={64} /><div className="m-card-main"><strong>{p.name}</strong><span className="t-caption">{p.categoryName}</span><div className="badges"><span className={`badge ${p.active ? 'badge-ok' : ''}`}>{p.active ? 'Faol' : 'Yashirin'}</span>{p.featured && <span className="badge badge-confirmed plain">Tanlangan</span>}</div></div></div>
                <dl className="m-card-facts"><div><dt>Narx</dt><dd className="num">{money(p.price)}</dd></div><div><dt>Qoldiq</dt><dd className={`num${p.stock ? '' : ' danger-text'}`}>{p.stock} dona</dd></div></dl>
                <div className="acts">
                  <IconAction icon="edit" label="Tahrirlash" onClick={() => { setProduct(p); setEditingProduct(true); }} disabled={busy} />
                  <IconAction icon="box" label="Qoldiq" onClick={() => setAdjust({ id: p.id, delta: 0, reason: '' })} disabled={busy} />
                  {p.active && <IconAction icon="trash" label="Oʻchirish" tone="danger" onClick={() => removeProduct(p)} disabled={busy} />}
                </div>
              </article>)}
            </div>
            <Pagination page={page} total={total} setPage={setPage} />
          </>}
        </>}

        {view === 'categories' && <div className="split">
          <Panel title={category.id ? 'Kategoriyani tahrirlash' : 'Kategoriya qoʻshish'} subtitle="Slug — havoladagi nom: kichik lotin harflari va chiziqcha" className="sticky-panel">
            <form className="form-stack" onSubmit={saveCategory}>
              <Field label="Nomi"><input className="input" value={category.name} onChange={e => setCategory({ ...category, name: e.target.value })} minLength={2} required placeholder="Masalan: Soatlar" /></Field>
              <Field label="Slug"><input className="input" value={category.slug} onChange={e => setCategory({ ...category, slug: e.target.value.toLowerCase() })} pattern="[a-z0-9]+(-[a-z0-9]+)*" required placeholder="soatlar" /></Field>
              <div className="form-actions"><button className="btn btn-primary" disabled={busy}>Saqlash</button>{category.id > 0 && <button type="button" className="btn btn-quiet" onClick={() => setCategory({ id: 0, name: '', slug: '' })}>Bekor qilish</button>}</div>
            </form>
          </Panel>
          <Panel title="Barcha kategoriyalar" subtitle={`${categories.length} ta`}>
            {!categories.length ? <EmptyState icon="layers" title="Kategoriya yoʻq" text="Mahsulot qoʻshishdan oldin kamida bitta kategoriya yarating." /> :
              <ul className="rows">{categories.map(cat => <li key={cat.id} className={category.id === cat.id ? 'editing' : ''}><span className="row-initial" aria-hidden="true">{cat.name.slice(0, 1)}</span><div className="row-main"><strong>{cat.name}</strong><span className="t-caption">{cat.slug}</span></div><div className="acts"><IconAction icon="edit" label="Tahrirlash" onClick={() => setCategory(cat)} disabled={busy} />{role === 'owner' && <IconAction icon="trash" label="Oʻchirish" tone="danger" onClick={() => removeCategory(cat)} disabled={busy} />}</div></li>)}</ul>}
          </Panel>
        </div>}

        {view === 'orders' && <>
          <div className="list-meta"><span className="num">{loading ? 'Yuklanmoqda...' : `${total} ta buyurtma`}</span><div className="chips-row" role="group" aria-label="Toʻlov holati boʻyicha">{paymentFilters.map(([key, label]) => <button key={key} type="button" className={`chip${paymentFilter === key ? ' active' : ''}`} aria-pressed={paymentFilter === key} onClick={() => { setPage(1); setPaymentFilter(key); }}>{label}</button>)}</div></div>
          {!loading && loaded === 'orders' && !orders.length ? <Panel><EmptyState icon="receipt" title="Buyurtma yoʻq" text="Mijoz ilovasidan tushgan buyurtmalar shu yerda koʻrinadi." /></Panel> : <>
            <div className="table-wrap desktop-only"><table className="table clickable"><thead><tr><th>Raqam</th><th>Xaridor</th><th>Holat</th><th>Toʻlov</th><th className="r">Jami</th><th>Sana</th><th /></tr></thead><tbody>
              {loading && !orders.length && [0, 1, 2].map(i => <tr key={i}><td colSpan={7}><div className="skeleton" style={{ height: 28 }} /></td></tr>)}
              {orders.map(order => <tr key={order.id} onClick={() => openOrder(order.id)}><td className="num strong nowrap">{order.orderNumber}</td><td><div className="stack"><span>{order.customerName}</span><span className="t-caption num">{order.phone}</span></div></td><td><div className="stack"><span className={`badge badge-${order.status}`}>{(order.fulfillment === 'pickup' && pickupStatusNames[order.status]) || statusNames[order.status] || order.status}</span>{order.fulfillment === 'pickup' ? <span className="t-caption">Olib ketish</span> : order.courierName && <span className="t-caption">{order.courierName} · {deliveryNames[order.deliveryStatus || ''] || ''}</span>}</div></td><td><div className="stack"><span className={`badge plain badge-${paymentStatusBadge[order.paymentStatus || 'pending']}`}>{paymentStatusNames[order.paymentStatus || 'pending']}</span><span className="t-caption">{paymentMethodNames[order.paymentMethod || 'cash']}</span></div></td><td className="r num nowrap strong">{money(order.total)}</td><td className="t-muted nowrap">{formatDateTime(order.createdAt)}</td><td className="r"><button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); openOrder(order.id); }} disabled={busy}>Koʻrish</button></td></tr>)}
            </tbody></table></div>
            <div className="cards mobile-only">
              {orders.map(order => <article key={order.id} className="m-card">
                <div className="m-card-row"><div className="stack"><strong className="num">{order.orderNumber}</strong><span className="t-caption">{formatDateTime(order.createdAt)}</span></div><span className={`badge badge-${order.status}`}>{statusNames[order.status] || order.status}</span></div>
                <dl className="m-card-facts"><div><dt>Xaridor</dt><dd>{order.customerName}<span className="t-caption num">{order.phone}</span></dd></div><div><dt>Jami</dt><dd className="num">{money(order.total)}</dd></div><div><dt>Toʻlov</dt><dd><span className={`badge plain badge-${paymentStatusBadge[order.paymentStatus || 'pending']}`}>{paymentStatusNames[order.paymentStatus || 'pending']}</span><span className="t-caption">{paymentMethodNames[order.paymentMethod || 'cash']}{order.fulfillment === 'pickup' ? ' · olib ketish' : ''}</span></dd></div></dl>
                {order.courierName && <span className="t-caption"><Icon name="courier" size={14} /> {order.courierName} · {deliveryNames[order.deliveryStatus || ''] || ''}</span>}
                <button className="btn btn-secondary btn-block" onClick={() => openOrder(order.id)} disabled={busy}>Koʻrish</button>
              </article>)}
            </div>
            <Pagination page={page} total={total} setPage={setPage} />
          </>}
        </>}

        {view === 'banners' && <BannersView request={request} upload={upload} categories={categories} settings={publicSettings} onDefaultSaved={() => void loadPublic()} />}
        {view === 'reviews' && <ReviewsView request={request} />}
        {view === 'integrations' && (role === 'owner' ? <IntegrationsView request={request} /> : <Panel><EmptyState icon="lock" title="Ruxsat yoʻq" text="Integratsiyalarni faqat super admin boshqaradi." /></Panel>)}

        {view === 'settings' && (error && loaded !== 'settings' ? <Panel><EmptyState icon={error === NETWORK_MESSAGE ? 'wifiOff' : 'alert'} title="Sozlamalar yuklanmadi" text={error} action={retry} /></Panel> : <div className="settings">
          {role !== 'owner' && <div className="banner banner-info"><Icon name="alert" size={20} /><div>Sozlamalarni faqat doʻkon egasi (super admin) oʻzgartira oladi.</div></div>}
          <BrandPanel request={request} upload={upload} canEdit={role === 'owner'} onSaved={() => void loadPublic()} />
          <StorePanel request={request} canEdit={role === 'owner'} mapsKey={mapsKey || undefined} settings={publicSettings} onSaved={() => void loadPublic()} />
          <PaymentSettingsPanel request={request} canEdit={role === 'owner'} settings={publicSettings} onSaved={() => void loadPublic()} openIntegrations={() => changeView('integrations')} />
          <form className="settings-form" onSubmit={e => { e.preventDefault(); execute(() => request('/admin/settings', { method: 'PUT', body: JSON.stringify({ contact_phone: settings.contact_phone, delivery_info: settings.delivery_info }) })); }}>
            <Panel title="Doʻkon bilan aloqa" subtitle="Mijoz ilovasining Profil, Savat va doʻkon xaritasida koʻrinadi">
              <div className="form-grid">
                <Field label="Aloqa telefoni"><input className="input" value={settings.contact_phone} onChange={e => setSettings({ ...settings, contact_phone: e.target.value })} readOnly={role !== 'owner'} placeholder="+998 90 123 45 67" inputMode="tel" /></Field>
                <Field label="Yetkazib berish maʼlumoti" wide><textarea className="input" value={settings.delivery_info} onChange={e => setSettings({ ...settings, delivery_info: e.target.value })} readOnly={role !== 'owner'} /></Field>
              </div>
              {role === 'owner' && <div className="form-actions end"><button className="btn btn-primary" disabled={busy}>{busy ? <><span className="spinner" />Saqlanmoqda...</> : 'Saqlash'}</button></div>}
            </Panel>
          </form>
          <ThemePanel mode={themeMode} setMode={setThemeMode} />
          {role === 'owner' && <StaffPanel request={request} meId={me?.id} />}
          <PasswordPanel request={request} />
          {securityPanel}
          {debug && <Panel title="Texnik sozlamalar" subtitle="Faqat sinov (debug) ilovasida koʻrinadi"><button className="btn btn-secondary" onClick={openApiSettings}><Icon name="server" size={18} />Server (API) manzili</button></Panel>}
        </div>)}
      </main>
    </div>

    {editingProduct && <Modal as="form" onSubmit={saveProduct} size="lg" title={product.id ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'} onClose={closeProduct} footer={<><button type="button" className="btn btn-quiet" onClick={closeProduct}>Bekor qilish</button><button className="btn btn-primary" disabled={busy}>{busy ? <><span className="spinner" />Saqlanmoqda...</> : 'Saqlash'}</button></>}>
      <section className="form-section"><h4>Asosiy maʼlumot</h4><div className="form-grid">
        <Field label="Nomi" wide><input className="input" value={product.name} onChange={e => setProduct({ ...product, name: e.target.value })} required minLength={2} /></Field>
        <Field label="Slug" hint="Kichik lotin harflari, raqam va chiziqcha"><input className="input" value={product.slug} onChange={e => setProduct({ ...product, slug: e.target.value.toLowerCase() })} required pattern="[a-z0-9]+(-[a-z0-9]+)*" /></Field>
        <Field label="Kategoriya"><select className="input" value={product.categoryId} onChange={e => setProduct({ ...product, categoryId: Number(e.target.value) })} required><option value="0">Tanlang</option>{categories.map(cat => <option value={cat.id} key={cat.id}>{cat.name}</option>)}</select></Field>
      </div></section>
      <section className="form-section"><h4>Narx va qoldiq</h4><div className="form-grid">
        <Field label="Narx (soʻm)"><input className="input num" type="number" inputMode="numeric" min="0" value={product.price} onChange={e => setProduct({ ...product, price: Number(e.target.value) })} required /></Field>
        <Field label="Qoldiq" hint={product.id ? 'Mavjud mahsulot qoldigʻi «Qoldiq» tugmasi orqali oʻzgaradi' : undefined}><input className="input num" type="number" inputMode="numeric" min="0" value={product.stock} disabled={!!product.id} onChange={e => setProduct({ ...product, stock: Number(e.target.value) })} required /></Field>
      </div></section>
      <section className="form-section"><h4>Tavsif</h4><Field label="Mahsulot haqida"><textarea className="input" rows={4} value={product.description} onChange={e => setProduct({ ...product, description: e.target.value })} /></Field></section>
      <section className="form-section"><h4>Rasmlar <span className="t-caption num">{product.images.length}/8</span></h4>
        <div className="image-grid">
          {product.images.map((url, i) => <div key={url} className="image-tile"><img src={url} alt={`Mahsulot rasmi ${i + 1}`} />{i === 0 && <span className="image-main">Asosiy</span>}<button type="button" className="image-remove" onClick={() => setProduct({ ...product, images: product.images.filter((_, n) => n !== i) })} aria-label="Olib tashlash"><Icon name="trash" size={16} /></button></div>)}
        </div>
        {product.images.length < 8 ? <ImagePicker disabled={busy} upload={uploadImage} /> : <p className="t-caption">Eng koʻpi 8 ta rasm.</p>}
      </section>
      <section className="form-section"><h4>Koʻrinish</h4><div className="toggles">
        <Toggle label="Faol" hint="Mijoz katalogida koʻrinadi" checked={product.active} onChange={value => setProduct({ ...product, active: value })} />
        <Toggle label="Tanlangan" hint="Bosh sahifadagi «Tanlangan mahsulotlar»da" checked={product.featured} onChange={value => setProduct({ ...product, featured: value })} />
      </div></section>
    </Modal>}

    {adjust.id > 0 && <Modal as="form" size="sm" title="Qoldiqni oʻzgartirish" subtitle={products.find(p => p.id === adjust.id)?.name} onClose={closeAdjust} onSubmit={e => { e.preventDefault(); execute(async () => { await request(`/admin/products/${adjust.id}/adjust-stock`, { method: 'POST', body: JSON.stringify({ delta: adjust.delta, reason: adjust.reason }) }); setAdjust({ id: 0, delta: 0, reason: '' }); await load('products'); }); }} footer={<><button type="button" className="btn btn-quiet" onClick={closeAdjust}>Bekor qilish</button><button className="btn btn-primary" disabled={busy}>Saqlash</button></>}>
      <div className="form-stack">
        <p className="t-muted">Hozirgi qoldiq: <strong className="num">{products.find(p => p.id === adjust.id)?.stock ?? '—'} dona</strong></p>
        <Field label="Farq (+/−)" hint="Kirim uchun musbat (5), chiqim uchun manfiy (−2) son"><input className="input num" type="number" value={adjust.delta} onChange={e => setAdjust({ ...adjust, delta: Number(e.target.value) })} required /></Field>
        <Field label="Sabab"><input className="input" value={adjust.reason} onChange={e => setAdjust({ ...adjust, reason: e.target.value })} required minLength={3} placeholder="Masalan: yangi partiya keldi" /></Field>
      </div>
    </Modal>}

    {selectedOrder && <Modal size="lg" title={selectedOrder.orderNumber} badge={<span className={`badge badge-${selectedOrder.status}`}>{(selectedOrder.fulfillment === 'pickup' && pickupStatusNames[selectedOrder.status]) || statusNames[selectedOrder.status] || selectedOrder.status}</span>} subtitle={formatDateTime(selectedOrder.createdAt)} onClose={closeOrder}>
      <div className="order-detail">
        <section className="od-block"><h4>Xaridor</h4><div className="facts">
          <div><Icon name="user" size={18} /><span>{selectedOrder.customerName}</span></div>
          <div><Icon name="phone" size={18} /><span className="num">{selectedOrder.phone}</span></div>
          <div><Icon name="pin" size={18} /><span>{selectedOrder.address}</span></div>
        </div></section>
        <OrderDelivery order={selectedOrder} extras={extras} request={request} mapsKey={mapsKey || undefined} onChanged={() => { openOrder(selectedOrder.id); void load('orders'); }} />
        {nextStatuses[selectedOrder.status] && <section className="od-block"><h4>Holatni oʻzgartirish</h4>{extras?.delivery && !['declined', 'cancelled'].includes(extras.delivery.status) && <p className="t-caption">Kuryer biriktirilgan: «Yoʻlga chiqarildi» va «Yetkazildi» kuryer va mijoz tasdigʻi orqali qoʻyiladi.</p>}<div className="status-actions">{nextStatuses[selectedOrder.status].filter(next => !(extras?.delivery && !['declined', 'cancelled'].includes(extras.delivery.status) && (next === 'shipped' || next === 'delivered'))).map(next => <button key={next} className={`btn ${next === 'cancelled' ? 'btn-danger' : 'btn-primary'}`} onClick={() => status(next)} disabled={busy}>{(selectedOrder.fulfillment === 'pickup' && pickupStatusNames[next]) || statusNames[next] || next}</button>)}</div></section>}
        <section className="od-block"><h4>Mahsulotlar</h4><ul className="line-items">{selectedOrder.items.map((item, i) => <li key={i}><span className="li-name">{item.name}<span className="t-caption num"> × {item.quantity}</span></span><span className="num">{money(item.price * item.quantity)}</span></li>)}</ul><div className="li-total"><span>Jami</span><strong className="num">{money(selectedOrder.total)}</strong></div></section>
        <OrderPayment order={selectedOrder} payments={payments} transactions={transactions} role={role} request={request} onChanged={() => { openOrder(selectedOrder.id); void load('orders'); }} />
      </div>
    </Modal>}

    {confirmBox && <ConfirmDialog title={confirmBox.title} text={confirmBox.text} confirmLabel={confirmBox.label} busy={busy} onCancel={closeConfirm} onConfirm={() => { const run = confirmBox.run; setConfirmBox(null); run(); }} />}
    {message && <div className="toast" role="status"><Icon name="check" size={18} stroke={2.2} />{message}</div>}
  </div>;
}
function Pagination({ page, total, setPage }: { page: number; total: number; setPage: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 20));
  if (pages <= 1) return null;
  return <div className="pagination"><button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="back" size={16} />Oldingi</button><span className="num">{page} / {pages}</span><button className="btn btn-sm btn-secondary" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Keyingi<Icon name="chevron" size={16} /></button></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
