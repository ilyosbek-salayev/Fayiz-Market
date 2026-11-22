import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Category, Product } from '@fayz/shared';
import { money } from '@fayz/shared';
import { BrandMark, Icon, type IconName } from '../../../packages/ui/src/Icon';
import { NETWORK_MESSAGE, formatDateTime, formatDay, friendlyError, nativeDebug, openApiSettings, paintSystemBars } from '../../../packages/ui/src/format';
import { ConfirmDialog, EmptyState, Field, IconAction, MetricCard, Modal, Panel, Thumb, Toggle } from './components';
import '../../../packages/ui/src/tokens.css';
import './style.css';

declare global { interface Window { fayzDesktop?: { request: (input: { path: string; method: string; authorization?: string; contentType?: string; body?: string | Uint8Array }) => Promise<{ status: number; data: any }> } } }

const API = import.meta.env.VITE_API_URL || (window.location.pathname.startsWith('/__app/') ? window.location.origin : 'http://localhost:8787');
type View = 'dashboard' | 'products' | 'categories' | 'orders' | 'settings';
type Order = { id: number; orderNumber: string; customerName: string; phone: string; address: string; status: string; total: number; createdAt: string; items: { name: string; price: number; quantity: number }[] };
type Report = { orders: { orders: number; ordered_total: number; delivered_total: number }; payments: { received_total: number }; inventory: { products: number; units: number }; daily: { day: string; orders: number; total: number }[] };
const statusNames: Record<string, string> = { new: 'Yangi', confirmed: 'Tasdiqlangan', preparing: 'Tayyorlanmoqda', shipped: 'Yoʻlda', delivered: 'Yetkazildi', cancelled: 'Bekor qilingan' };
const methodNames: Record<string, string> = { cash: 'Naqd', bank_transfer: 'Bank oʻtkazmasi', card_terminal: 'Terminal' };
const roleNames: Record<string, string> = { owner: 'Egasi', manager: 'Menejer' };
const emptyProduct = { name: '', slug: '', description: '', categoryId: 0, price: 0, stock: 0, active: true, featured: false, images: [] as string[] };
const views: [View, string, IconName, string][] = [
  ['dashboard', 'Boshqaruv', 'chart', 'Savdo va ombor holati'],
  ['products', 'Mahsulotlar', 'box', 'Katalog, narx va qoldiq'],
  ['categories', 'Kategoriyalar', 'layers', 'Katalog boʻlimlari'],
  ['orders', 'Buyurtmalar', 'receipt', 'Holat va toʻlovlar'],
  ['settings', 'Sozlamalar', 'settings', 'Doʻkon va administratorlar'],
];
const nextStatuses: Record<string, string[]> = { new: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['shipped', 'cancelled'], shipped: ['delivered'] };
type Confirmation = { title: string; text: string; label: string; run: () => void };

function App() {
  const [token, setToken] = useState(sessionStorage.getItem('fayz_admin_token') || '');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [view, setView] = useState<View>('dashboard'); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]); const [categories, setCategories] = useState<Category[]>([]); const [orders, setOrders] = useState<Order[]>([]); const [report, setReport] = useState<Report | null>(null);
  const [product, setProduct] = useState<typeof emptyProduct & { id?: number }>(emptyProduct); const [editingProduct, setEditingProduct] = useState(false);
  const [category, setCategory] = useState({ id: 0, name: '', slug: '' }); const [selectedOrder, setSelectedOrder] = useState<Order | null>(null); const [payments, setPayments] = useState<any[]>([]);
  const [payment, setPayment] = useState({ amount: 0, method: 'cash', reference: '', note: '' });
  const [adjust, setAdjust] = useState({ id: 0, delta: 0, reason: '' });
  const [settings, setSettings] = useState({ contact_phone: '', delivery_info: '', banner_title: '', banner_subtitle: '' }); const [role, setRole] = useState('manager');
  const [users, setUsers] = useState<{ id: number; email: string; role: string }[]>([]);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'manager' });
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  // UI-only state
  const [menuOpen, setMenuOpen] = useState(false); const [confirmBox, setConfirmBox] = useState<Confirmation | null>(null); const [loaded, setLoaded] = useState<View | ''>('');
  const debug = useMemo(nativeDebug, []);
  useEffect(() => { document.documentElement.dataset.theme = 'yellow'; paintSystemBars(); }, []);
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
    if (target === 'orders') { const data = await request<{ orders: Order[]; total: number }>(`/admin/orders?page=${p}`); setOrders(data.orders); setTotal(data.total); }
    if (target === 'settings') { const data = await request<{ settings: typeof settings }>('/settings'); setSettings(data.settings); if (me.admin.role === 'owner') { const userData = await request<{ users: typeof users }>('/admin/users'); setUsers(userData.users); } }
    setLoaded(target);
  }
  useEffect(() => { if (token) execute(() => load(view, page), ''); }, [token, view, page]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3200); return () => clearTimeout(timer); }, [message]);
  const changeView = (next: View) => { setPage(1); setView(next); setError(''); setMessage(''); setMenuOpen(false); setLoaded(''); window.scrollTo({ top: 0 }); };
  const login = (event: React.FormEvent) => { event.preventDefault(); execute(async () => { const data = await request<{ token: string }>('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }); sessionStorage.setItem('fayz_admin_token', data.token); setToken(data.token); setPassword(''); }, ''); };
  const logout = () => execute(async () => { await request('/admin/logout', { method: 'POST' }); sessionStorage.removeItem('fayz_admin_token'); setToken(''); }, '');
  const saveProduct = (event: React.FormEvent) => { event.preventDefault(); execute(async () => { await request(product.id ? `/admin/products/${product.id}` : '/admin/products', { method: product.id ? 'PUT' : 'POST', body: JSON.stringify(product) }); setEditingProduct(false); setProduct(emptyProduct); await load('products'); }); };
  const uploadImage = async (file: File) => { setBusy(true); setError(''); try { const result = window.fayzDesktop ? await window.fayzDesktop.request({ path: '/admin/images', method: 'POST', authorization: `Bearer ${token}`, contentType: file.type, body: new Uint8Array(await file.arrayBuffer()) }) : await (async () => { const response = await fetch(API + '/admin/images', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type }, body: file }); return { status: response.status, data: await response.json() }; })(); if (result.status < 200 || result.status >= 300) throw new Error(result.data.error?.message || 'Rasm yuklanmadi'); setProduct(current => ({ ...current, images: [...current.images, result.data.url] })); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } };
  const saveCategory = (event: React.FormEvent) => { event.preventDefault(); execute(async () => { await request(category.id ? `/admin/categories/${category.id}` : '/admin/categories', { method: category.id ? 'PUT' : 'POST', body: JSON.stringify({ name: category.name, slug: category.slug }) }); setCategory({ id: 0, name: '', slug: '' }); await load('categories'); }); };
  const openOrder = (id: number) => execute(async () => { const data = await request<{ order: Order; payments: any[] }>(`/admin/orders/${id}`); setSelectedOrder(data.order); setPayments(data.payments); setPayment({ amount: data.order.total - data.payments.reduce((sum, x) => sum + x.amount, 0), method: 'cash', reference: '', note: '' }); }, '');
  const savePayment = (event: React.FormEvent) => { event.preventDefault(); if (!selectedOrder) return; execute(async () => { await request(`/admin/orders/${selectedOrder.id}/payments`, { method: 'POST', body: JSON.stringify(payment) }); await openOrder(selectedOrder.id); }); };
  const status = (next: string) => { if (!selectedOrder) return; execute(async () => { await request(`/admin/orders/${selectedOrder.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); await openOrder(selectedOrder.id); await load('orders'); }); };
  const removeProduct = (p: Product) => setConfirmBox({ title: 'Mahsulotni yashirish', text: `«${p.name}» katalogdan yashiriladi. Mavjud buyurtmalar oʻzgarmaydi.`, label: 'Yashirish', run: () => execute(async () => { await request(`/admin/products/${p.id}`, { method: 'DELETE' }); await load('products'); }) });
  const removeCategory = (cat: Category) => setConfirmBox({ title: 'Kategoriyani oʻchirish', text: `«${cat.name}» kategoriyasi oʻchiriladi.`, label: 'Oʻchirish', run: () => execute(async () => { await request(`/admin/categories/${cat.id}`, { method: 'DELETE' }); await load('categories'); }) });
  const closeProduct = useCallback(() => setEditingProduct(false), []);
  const closeAdjust = useCallback(() => setAdjust({ id: 0, delta: 0, reason: '' }), []);
  const closeOrder = useCallback(() => setSelectedOrder(null), []);
  const closeConfirm = useCallback(() => setConfirmBox(null), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEffect(() => { if (!menuOpen) return; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [menuOpen, closeMenu]);

  if (!token) return <main className="login-page">
    <form className="login-card" onSubmit={login}>
      <div className="login-brand"><BrandMark size={52} /><div><h1>Fayz Market</h1><p>Boshqaruv paneliga kirish</p></div></div>
      {error && <div className="banner banner-error" role="alert"><Icon name={error === NETWORK_MESSAGE ? 'wifiOff' : 'alert'} size={20} /><div>{error}</div></div>}
      <Field label="Email"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" placeholder="admin@fayzmarket.uz" /></Field>
      <Field label="Parol" hint="Kamida 10 ta belgi"><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={10} required autoComplete="current-password" /></Field>
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? <><span className="spinner" />Tekshirilmoqda...</> : 'Kirish'}</button>
      {debug && <button type="button" className="btn btn-quiet btn-block" onClick={openApiSettings}><Icon name="server" size={18} />Server manzili (sinov)</button>}
    </form>
    <p className="login-foot">Fayz Market V1.0</p>
  </main>;

  const current = views.find(v => v[0] === view)!;
  const pages = Math.max(1, Math.ceil(total / 20));
  const loading = busy && loaded !== view;
  const retry = <button className="btn btn-sm btn-secondary" onClick={() => execute(() => load(view, page), '')}><Icon name="refresh" size={16} />Qayta urinish</button>;
  const paid = payments.reduce((sum, x) => sum + x.amount, 0);
  const maxDay = Math.max(1, ...(report?.daily.map(d => d.total) || [1]));

  return <div className="shell">
    {busy && <div className="progress" aria-hidden="true" />}
    <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Boʻlimlar">
      <div className="side-brand"><BrandMark size={38} /><div><strong>Fayz Market</strong><span>Boshqaruv paneli</span></div><button className="icon-btn side-close" onClick={closeMenu} aria-label="Menyuni yopish"><Icon name="close" /></button></div>
      <nav className="side-nav">{views.map(([key, label, icon]) => <button key={key} className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => changeView(key)}><Icon name={icon} size={20} /><span>{label}</span></button>)}</nav>
      <div className="side-foot"><div className="side-user"><span className="avatar-sm"><Icon name="user" size={18} /></span><div><span className="t-caption">Rol</span><strong>{roleNames[role] || role}</strong></div></div><button className="btn btn-quiet btn-block" onClick={logout} disabled={busy}><Icon name="logout" size={18} />Chiqish</button></div>
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
      <main className="view" key={view}>

        {view === 'dashboard' && <>
          <div className="metrics">
            <MetricCard icon="receipt" label="Buyurtmalar" loading={!report} value={report?.orders.orders ?? '—'} caption="Barcha holatlar" />
            <MetricCard icon="tag" label="Buyurtma summasi" loading={!report} value={report ? money(report.orders.ordered_total) : '—'} caption={report ? <>Yetkazilgan: <span className="num">{money(report.orders.delivered_total)}</span></> : 'Bekor qilinganlarsiz'} />
            <MetricCard icon="wallet" label="Qayd etilgan toʻlov" loading={!report} value={report ? money(report.payments.received_total) : '—'} caption="Qoʻlda qayd etilgan summalar" />
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
          <div className="list-meta"><span className="num">{loading ? 'Yuklanmoqda...' : `${total} ta buyurtma`}</span></div>
          {!loading && loaded === 'orders' && !orders.length ? <Panel><EmptyState icon="receipt" title="Buyurtma yoʻq" text="Mijoz ilovasidan tushgan buyurtmalar shu yerda koʻrinadi." /></Panel> : <>
            <div className="table-wrap desktop-only"><table className="table clickable"><thead><tr><th>Raqam</th><th>Xaridor</th><th>Holat</th><th className="r">Jami</th><th>Sana</th><th /></tr></thead><tbody>
              {loading && !orders.length && [0, 1, 2].map(i => <tr key={i}><td colSpan={6}><div className="skeleton" style={{ height: 28 }} /></td></tr>)}
              {orders.map(order => <tr key={order.id} onClick={() => openOrder(order.id)}><td className="num strong nowrap">{order.orderNumber}</td><td><div className="stack"><span>{order.customerName}</span><span className="t-caption num">{order.phone}</span></div></td><td><span className={`badge badge-${order.status}`}>{statusNames[order.status] || order.status}</span></td><td className="r num nowrap strong">{money(order.total)}</td><td className="t-muted nowrap">{formatDateTime(order.createdAt)}</td><td className="r"><button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); openOrder(order.id); }} disabled={busy}>Koʻrish</button></td></tr>)}
            </tbody></table></div>
            <div className="cards mobile-only">
              {orders.map(order => <article key={order.id} className="m-card">
                <div className="m-card-row"><div className="stack"><strong className="num">{order.orderNumber}</strong><span className="t-caption">{formatDateTime(order.createdAt)}</span></div><span className={`badge badge-${order.status}`}>{statusNames[order.status] || order.status}</span></div>
                <dl className="m-card-facts"><div><dt>Xaridor</dt><dd>{order.customerName}<span className="t-caption num">{order.phone}</span></dd></div><div><dt>Jami</dt><dd className="num">{money(order.total)}</dd></div></dl>
                <button className="btn btn-secondary btn-block" onClick={() => openOrder(order.id)} disabled={busy}>Koʻrish</button>
              </article>)}
            </div>
            <Pagination page={page} total={total} setPage={setPage} />
          </>}
        </>}

        {view === 'settings' && (error && loaded !== 'settings' ? <Panel><EmptyState icon={error === NETWORK_MESSAGE ? 'wifiOff' : 'alert'} title="Sozlamalar yuklanmadi" text={error} action={retry} /></Panel> : <div className="settings">
          <form className="settings-form" onSubmit={e => { e.preventDefault(); execute(() => request('/admin/settings', { method: 'PUT', body: JSON.stringify(settings) })); }}>
            {role !== 'owner' && <div className="banner banner-info"><Icon name="alert" size={20} /><div>Sozlamalarni faqat doʻkon egasi oʻzgartira oladi.</div></div>}
            <Panel title="Doʻkon maʼlumotlari" subtitle="Mijoz ilovasining Profil va Savat sahifalarida koʻrinadi">
              <div className="form-grid">
                <Field label="Aloqa telefoni"><input className="input" value={settings.contact_phone} onChange={e => setSettings({ ...settings, contact_phone: e.target.value })} readOnly={role !== 'owner'} placeholder="+998 90 123 45 67" inputMode="tel" /></Field>
                <Field label="Yetkazib berish maʼlumoti" wide><textarea className="input" value={settings.delivery_info} onChange={e => setSettings({ ...settings, delivery_info: e.target.value })} readOnly={role !== 'owner'} /></Field>
              </div>
            </Panel>
            <Panel title="Bosh sahifa banneri" subtitle="Mijoz ilovasining bosh sahifasidagi sariq banner">
              <div className="form-grid">
                <Field label="Banner sarlavhasi"><input className="input" value={settings.banner_title} onChange={e => setSettings({ ...settings, banner_title: e.target.value })} readOnly={role !== 'owner'} /></Field>
                <Field label="Banner matni"><input className="input" value={settings.banner_subtitle} onChange={e => setSettings({ ...settings, banner_subtitle: e.target.value })} readOnly={role !== 'owner'} /></Field>
              </div>
              <div className="banner-preview" aria-label="Banner koʻrinishi"><span className="t-caption">Koʻrinishi</span><div className="mini-hero"><strong>{settings.banner_title || 'Fayz Market'}</strong><span>{settings.banner_subtitle || 'Siz uchun aksessuarlar'}</span></div></div>
            </Panel>
            {role === 'owner' && <div className="form-actions end"><button className="btn btn-primary" disabled={busy}>{busy ? <><span className="spinner" />Saqlanmoqda...</> : 'Saqlash'}</button></div>}
          </form>
          {role === 'owner' && <Panel title="Administratorlar" subtitle="Panelga kirish huquqi bor hisoblar">
            <ul className="rows">{users.map(user => <li key={user.id}><span className="row-initial" aria-hidden="true">{user.email.slice(0, 1).toUpperCase()}</span><div className="row-main"><strong className="break">{user.email}</strong></div><span className={`badge plain ${user.role === 'owner' ? 'badge-confirmed' : ''}`}>{roleNames[user.role] || user.role}</span></li>)}</ul>
            <form className="add-admin" onSubmit={e => { e.preventDefault(); execute(async () => { await request('/admin/users', { method: 'POST', body: JSON.stringify(newUser) }); setNewUser({ email: '', password: '', role: 'manager' }); await load('settings'); }); }}>
              <h4>Admin qoʻshish</h4>
              <div className="form-grid three">
                <Field label="Email"><input className="input" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required autoComplete="off" /></Field>
                <Field label="Parol" hint="Kamida 10 ta belgi"><input className="input" type="password" minLength={10} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required autoComplete="new-password" /></Field>
                <Field label="Rol"><select className="input" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}><option value="manager">Menejer</option><option value="owner">Egasi</option></select></Field>
              </div>
              <div className="form-actions"><button className="btn btn-secondary" disabled={busy}><Icon name="plus" size={18} />Qoʻshish</button></div>
            </form>
          </Panel>}
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
          {product.images.length < 8 && <label className="image-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { if (e.target.files?.[0]) uploadImage(e.target.files[0]); e.target.value = ''; }} disabled={busy} /><Icon name="upload" size={22} /><span>Rasm yuklash</span><small>JPG, PNG, WEBP</small></label>}
        </div>
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

    {selectedOrder && <Modal size="lg" title={selectedOrder.orderNumber} badge={<span className={`badge badge-${selectedOrder.status}`}>{statusNames[selectedOrder.status] || selectedOrder.status}</span>} subtitle={formatDateTime(selectedOrder.createdAt)} onClose={closeOrder}>
      <div className="order-detail">
        <section className="od-block"><h4>Xaridor</h4><div className="facts">
          <div><Icon name="user" size={18} /><span>{selectedOrder.customerName}</span></div>
          <div><Icon name="phone" size={18} /><span className="num">{selectedOrder.phone}</span></div>
          <div><Icon name="pin" size={18} /><span>{selectedOrder.address}</span></div>
        </div></section>
        {nextStatuses[selectedOrder.status] && <section className="od-block"><h4>Holatni oʻzgartirish</h4><div className="status-actions">{nextStatuses[selectedOrder.status].map(next => <button key={next} className={`btn ${next === 'cancelled' ? 'btn-danger' : 'btn-primary'}`} onClick={() => status(next)} disabled={busy}>{statusNames[next] || next}</button>)}</div></section>}
        <section className="od-block"><h4>Mahsulotlar</h4><ul className="line-items">{selectedOrder.items.map((item, i) => <li key={i}><span className="li-name">{item.name}<span className="t-caption num"> × {item.quantity}</span></span><span className="num">{money(item.price * item.quantity)}</span></li>)}</ul><div className="li-total"><span>Jami</span><strong className="num">{money(selectedOrder.total)}</strong></div></section>
        <section className="od-block"><h4>Toʻlovlar</h4>
          <div className="pay-summary"><div><span className="t-caption">Toʻlangan</span><strong className="num">{money(paid)}</strong></div><div><span className="t-caption">Qolgan</span><strong className="num">{money(Math.max(0, selectedOrder.total - paid))}</strong></div></div>
          {payments.length > 0 && <ul className="line-items">{payments.map(pay => <li key={pay.id}><span className="li-name">{methodNames[pay.method] || pay.method}<span className="t-caption"> {formatDateTime(pay.createdAt)}</span></span><span className="num">{money(pay.amount)}</span></li>)}</ul>}
          <form className="pay-form" onSubmit={savePayment}>
            <Field label="Qabul qilingan summa"><input className="input num" type="number" inputMode="numeric" min="1" value={payment.amount} onChange={e => setPayment({ ...payment, amount: Number(e.target.value) })} required /></Field>
            <Field label="Usul"><select className="input" value={payment.method} onChange={e => setPayment({ ...payment, method: e.target.value })}><option value="cash">Naqd</option><option value="bank_transfer">Bank oʻtkazmasi</option><option value="card_terminal">Terminal</option></select></Field>
            <Field label="Tranzaksiya havolasi" hint="Ixtiyoriy"><input className="input" value={payment.reference} onChange={e => setPayment({ ...payment, reference: e.target.value })} /></Field>
            <button className="btn btn-secondary" disabled={busy || payment.amount <= 0 || selectedOrder.status === 'cancelled'}><Icon name="wallet" size={18} />Toʻlovni qayd etish</button>
          </form>
          {selectedOrder.status === 'cancelled' && <p className="t-caption">Bekor qilingan buyurtmaga toʻlov yozilmaydi.</p>}
        </section>
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
