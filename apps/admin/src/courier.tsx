// Courier interface inside the admin app (role "courier"). Mobile-first; the API only returns the courier's
// own deliveries, and contact/destination only while the delivery is active.
import { useCallback, useEffect, useRef, useState } from 'react';
import { money } from '@fayz/shared';
import { BrandMark, Icon } from '../../../packages/ui/src/Icon';
import { formatDateTime, friendlyError } from '../../../packages/ui/src/format';
import { MapView, directionsLink, formatCoords, type LatLng, type MapMarker } from '../../../packages/ui/src/maps';
import { keepScreenOn, openExternal } from '../../../packages/ui/src/native';
import { agoText, deliveryNames } from '../../../packages/ui/src/stages';
import { EmptyState, Field } from './components';
import { PasswordPanel, useNotifications, type Request } from './expansion';

type Row = { id: number; status: string; version: number; assignedAt: string; updatedAt: string; orderNumber: string; total: number; address: string; itemCount: number };
type Detail = {
  delivery: { id: number; status: string; version: number; assignedAt: string; acceptedAt: string | null; pickedUpAt: string | null; arrivedAt: string | null; handedOverAt: string | null; confirmedAt: string | null };
  order: { orderNumber: string; total: number; status: string; createdAt: string; items: { name: string; quantity: number; price: number }[]; customerName: string; phone: string | null; address: string | null; details: string | null; note: string | null; location: LatLng | null };
  pickup: { address: string; lat: number | null; lng: number | null };
};
const ACTIVE = ['assigned', 'accepted', 'picked_up', 'on_the_way', 'arrived'];
const SHARE = ['accepted', 'picked_up', 'on_the_way', 'arrived'];
const actions: Record<string, [string, string, 'navigation' | 'box' | 'pin' | 'check' | 'courier'][]> = {
  assigned: [['accept', 'Qabul qilish', 'check']], accepted: [['pickup', 'Doʻkondan oldim', 'box']],
  picked_up: [['depart', 'Yoʻlga chiqdim', 'courier']], on_the_way: [['arrive', 'Manzilga yetib keldim', 'pin']], arrived: [['handover', 'Mijozga topshirdim', 'check']],
};

export function CourierApp({ request, me, onLogout, mapsKey, securityPanel }: { request: Request; me: { name: string; email: string }; onLogout: () => void; mapsKey?: string; securityPanel?: React.ReactNode }) {
  const [tab, setTab] = useState<'active' | 'history' | 'profile'>('active');
  const [rows, setRows] = useState<Row[] | null>(null); const [openId, setOpenId] = useState(0); const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const load = useCallback(async () => { try { const r = await request<{ deliveries: Row[] }>('/courier/deliveries'); setRows(r.deliveries); setError(''); } catch (e) { setError(friendlyError(e)); } }, []);
  useEffect(() => { void load(); const t = setInterval(() => document.visibilityState === 'visible' && load(), 30000); return () => clearInterval(t); }, [load]);
  useNotifications(request, 'courier', true, fresh => { setBanner(fresh[0].title); void load(); });
  useEffect(() => { const open = (e: Event) => { const id = Number((e as CustomEvent).detail); if (id) { setTab('active'); setOpenId(id); } }; window.addEventListener('fayz-open-order', open); return () => window.removeEventListener('fayz-open-order', open); }, []);
  const sharing = (rows || []).filter(r => SHARE.includes(r.status));
  const tracker = useLocationSharing(request, sharing.map(r => r.id));
  const list = (rows || []).filter(r => tab === 'active' ? ACTIVE.includes(r.status) || r.status === 'handed_over' : !ACTIVE.includes(r.status) && r.status !== 'handed_over');
  if (openId) return <CourierDetail id={openId} request={request} mapsKey={mapsKey} tracker={tracker} onChanged={load} onBack={() => { setOpenId(0); void load(); }} />;
  return <div className="courier-shell">
    <header className="courier-top"><BrandMark size={34} /><div><strong>Kuryer paneli</strong><span className="t-caption">{me.name || me.email}</span></div><button className="icon-btn filled" onClick={load} aria-label="Yangilash"><Icon name="refresh" size={20} /></button></header>
    {sharing.length > 0 && <TrackerStrip tracker={tracker} />}
    {banner && <div className="banner banner-info" role="status"><Icon name="bell" size={20} /><div>{banner}<div className="banner-actions"><button className="btn btn-sm btn-secondary" onClick={() => setBanner('')}>Yopish</button></div></div></div>}
    {error && <div className="banner banner-error" role="alert"><Icon name="wifiOff" size={20} /><div>{error}</div></div>}
    <div className="segmented courier-tabs" role="tablist">{([['active', 'Faol'], ['history', 'Tarix'], ['profile', 'Profil']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}{key === 'active' && rows ? ` (${rows.filter(r => ACTIVE.includes(r.status) || r.status === 'handed_over').length})` : ''}</button>)}</div>
    {tab === 'profile' ? <div className="courier-list">
      <div className="panel"><div className="courier-me"><span className="avatar-sm"><Icon name="courier" size={20} /></span><div><strong>{me.name || 'Kuryer'}</strong><span className="t-caption">{me.email}</span></div></div></div>
      {securityPanel}
      <PasswordPanel request={request} />
      <button className="btn btn-quiet btn-block" onClick={onLogout}><Icon name="logout" size={18} />Chiqish</button>
    </div> : <div className="courier-list">
      {!rows && [0, 1].map(i => <div key={i} className="m-card"><div className="skeleton" style={{ height: 72 }} /></div>)}
      {rows && !list.length && <EmptyState icon={tab === 'active' ? 'courier' : 'history'} title={tab === 'active' ? 'Hozir yetkazish yoʻq' : 'Tarix boʻsh'} text={tab === 'active' ? 'Administrator buyurtma tayinlaganda shu yerda va bildirishnomada koʻrinadi.' : 'Yakunlangan yetkazishlar shu yerda saqlanadi.'} />}
      {list.map(r => <button key={r.id} className="m-card delivery-card" onClick={() => setOpenId(r.id)}>
        <div className="m-card-row"><strong className="num">{r.orderNumber}</strong><span className={`badge ${r.status === 'assigned' ? 'badge-confirmed' : ['confirmed', 'resolved'].includes(r.status) ? 'badge-delivered' : ['declined', 'cancelled', 'disputed'].includes(r.status) ? 'badge-cancelled' : 'badge-shipped'}`}>{deliveryNames[r.status] || r.status}</span></div>
        {r.address && <span className="delivery-address"><Icon name="pin" size={16} />{r.address}</span>}
        <span className="t-caption num">{r.itemCount} ta mahsulot · {money(r.total)} · {formatDateTime(r.updatedAt)}</span>
      </button>)}
    </div>}
  </div>;
}

function CourierDetail({ id, request, mapsKey, tracker, onBack, onChanged }: { id: number; request: Request; mapsKey?: string; tracker: Tracker; onBack: () => void; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<Detail | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false); const [reason, setReason] = useState('');
  const [route, setRoute] = useState<{ text: string; ok: boolean } | null>(null);
  const load = useCallback(async () => { try { setData(await request<Detail>(`/courier/deliveries/${id}`)); setError(''); } catch (e) { setError(friendlyError(e)); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  const act = async (action: string, extra: Record<string, string> = {}) => {
    if (!data) return; setBusy(true); setError('');
    // The parent list drives location sharing, so it is refreshed after every step.
    try { await request(`/courier/deliveries/${id}/${action}`, { method: 'POST', body: JSON.stringify({ version: data.delivery.version, ...extra }) }); setDeclining(false); await Promise.all([load(), onChanged()]); if (action === 'decline') onBack(); }
    catch (e) { setError(friendlyError(e)); await load(); } finally { setBusy(false); }
  };
  const loadRoute = async () => {
    setRoute(null);
    try { const r = await request<{ distanceMeters: number; durationSeconds: number }>(`/courier/deliveries/${id}/route`); setRoute({ ok: true, text: `${(r.distanceMeters / 1000).toFixed(1)} km · ${Math.round(r.durationSeconds / 60)} daqiqa (Google Routes, tirbandlik bilan)` }); }
    catch (e) { setRoute({ ok: false, text: friendlyError(e) }); }
  };
  if (!data) return <div className="courier-shell"><button className="btn btn-quiet" onClick={onBack}><Icon name="back" size={18} />Orqaga</button>{error ? <div className="banner banner-error"><Icon name="alert" size={20} /><div>{error}</div></div> : <div className="skeleton" style={{ height: 260, borderRadius: 16 }} />}</div>;
  const { delivery: d, order: o, pickup } = data;
  const store = pickup.lat != null && pickup.lng != null ? { lat: pickup.lat, lng: pickup.lng } : null;
  const beforePickup = ['assigned', 'accepted'].includes(d.status);
  const target = beforePickup ? store : o.location;
  const markers: MapMarker[] = [];
  if (o.location) markers.push({ ...o.location, kind: 'destination', title: 'Mijoz' });
  if (store) markers.push({ ...store, kind: 'store', title: 'Doʻkon' });
  if (tracker.last) markers.push({ lat: tracker.last.lat, lng: tracker.last.lng, kind: 'courier', title: 'Siz' });
  return <div className="courier-shell">
    <header className="courier-detail-top"><button className="icon-btn filled" onClick={onBack} aria-label="Orqaga"><Icon name="back" /></button><div><strong className="num">{o.orderNumber}</strong><span className="t-caption">{deliveryNames[d.status] || d.status}</span></div></header>
    {SHARE.includes(d.status) && <TrackerStrip tracker={tracker} />}
    {error && <div className="banner banner-error" role="alert"><Icon name="alert" size={20} /><div>{error}</div></div>}
    {markers.length > 0 && <MapView apiKey={mapsKey} markers={markers} fit={markers.length > 1} className="tall" />}
    {markers.length > 0 && <div className="legend"><span><i className="dot-destination" />Mijoz</span>{store && <span><i className="dot-store" />Doʻkon</span>}{tracker.last && <span><i className="dot-courier" />Siz</span>}</div>}
    {target && <div className="nav-row">
      <button className="btn btn-primary" onClick={() => openExternal(directionsLink(target, tracker.last))}><Icon name="navigation" size={18} />{beforePickup ? 'Doʻkonga navigatsiya' : 'Mijozga navigatsiya'}</button>
      {!beforePickup && <button className="btn btn-secondary" onClick={loadRoute}><Icon name="map" size={18} />Masofa va vaqt</button>}
    </div>}
    {route && <p className={`t-caption route-line ${route.ok ? '' : 'bad'}`}>{route.text}</p>}
    {!o.location && ACTIVE.includes(d.status) && <div className="banner banner-warning"><Icon name="alert" size={20} /><div>Mijoz xaritada nuqta belgilamagan. Matnli manzil va telefon orqali aniqlang.</div></div>}
    <section className="panel courier-facts">
      {o.address && <div className="info-line"><Icon name="pin" size={18} /><div><strong>{o.address}</strong>{o.details && <span className="t-caption">{o.details}</span>}{o.location && <span className="t-caption num">{formatCoords(o.location)}</span>}</div></div>}
      <div className="info-line"><Icon name="user" size={18} /><div><strong>{o.customerName}</strong>{o.note && <span className="t-caption">Izoh: {o.note}</span>}</div>{o.phone && <button className="btn btn-sm btn-secondary" onClick={() => openExternal(`tel:${o.phone}`)}><Icon name="phone" size={16} />Qoʻngʻiroq</button>}</div>
      {store && beforePickup && <div className="info-line"><Icon name="box" size={18} /><div><strong>Olib ketish: doʻkon</strong><span className="t-caption">{pickup.address || formatCoords(store)}</span></div></div>}
      <ul className="line-items">{o.items.map((item, i) => <li key={i}><span className="li-name">{item.name}<span className="t-caption num"> × {item.quantity}</span></span><span className="num">{money(item.price * item.quantity)}</span></li>)}</ul>
      <div className="li-total"><span>Buyurtma summasi</span><strong className="num">{money(o.total)}</strong></div>
    </section>
    {d.status === 'handed_over' && <div className="banner banner-info"><Icon name="clock" size={20} /><div>Topshirildi. Mijoz ilovada tasdiqlashi kutilmoqda.</div></div>}
    {(actions[d.status] || []).length > 0 && <div className="courier-actions">
      {!declining && actions[d.status].map(([action, label, icon]) => <button key={action} className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => act(action)}>{busy ? <span className="spinner" /> : <Icon name={icon} size={20} />}{label}</button>)}
      {d.status === 'assigned' && (declining ? <div className="form-stack"><Field label="Rad etish sababi"><textarea className="input" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Masalan: mashina buzildi" /></Field><div className="form-actions"><button className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => act('decline', { reason: reason.trim() })}>Rad etish</button><button className="btn btn-quiet" onClick={() => setDeclining(false)}>Orqaga</button></div></div>
        : <button className="btn btn-quiet btn-block" onClick={() => setDeclining(true)}>Qabul qila olmayman</button>)}
    </div>}
  </div>;
}

// ---------------------------------------------------------------- Location sharing (foreground)
type Tracker = { state: 'off' | 'starting' | 'on' | 'denied' | 'error'; last: (LatLng & { accuracy: number }) | null; sentAt: number; message: string };
/** Shares the device position for the given active deliveries while the app is open (every ≥15 s or ≥30 m). */
function useLocationSharing(request: Request, ids: number[]): Tracker {
  const [tracker, setTracker] = useState<Tracker>({ state: 'off', last: null, sentAt: 0, message: '' });
  const lastSent = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    if (!ids.length || !navigator.geolocation) { setTracker(t => ({ ...t, state: navigator.geolocation ? 'off' : 'error', message: navigator.geolocation ? '' : 'Qurilmada GPS yoʻq' })); return; }
    setTracker(t => ({ ...t, state: 'starting' })); keepScreenOn(true);
    const watch = navigator.geolocation.watchPosition(async pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
      setTracker(t => ({ ...t, state: 'on', last: p, message: '' }));
      const prev = lastSent.current, now = Date.now();
      const moved = prev ? Math.hypot((p.lat - prev.lat) * 111000, (p.lng - prev.lng) * 111000 * Math.cos(p.lat * Math.PI / 180)) : Infinity;
      if (prev && now - prev.at < 15000 && moved < 30) return;
      lastSent.current = { at: now, lat: p.lat, lng: p.lng };
      try { await Promise.all(ids.map(id => request(`/courier/deliveries/${id}/location`, { method: 'POST', body: JSON.stringify(p) }))); setTracker(t => ({ ...t, sentAt: Date.now() })); }
      catch (e) { setTracker(t => ({ ...t, message: friendlyError(e) })); }
    }, err => setTracker(t => ({ ...t, state: err.code === 1 ? 'denied' : 'error', message: err.code === 1 ? 'Joylashuvga ruxsat berilmagan. Mijoz sizni xaritada koʻrmaydi.' : 'GPS signali yoʻq — joylashuv yangilanmayapti.' })), { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    return () => { navigator.geolocation.clearWatch(watch); keepScreenOn(false); setTracker(t => ({ ...t, state: 'off' })); };
  }, [key]);
  return tracker;
}
function TrackerStrip({ tracker }: { tracker: Tracker }) {
  const [, tick] = useState(0); useEffect(() => { const t = setInterval(() => tick(n => n + 1), 5000); return () => clearInterval(t); }, []);
  const ok = tracker.state === 'on' && !tracker.message;
  return <div className={`tracker-strip ${ok ? 'on' : 'warn'}`} role="status">
    <span className={`live-dot${ok ? '' : ' stale'}`} />
    <div><strong>{ok ? 'Joylashuv ulashilmoqda' : tracker.state === 'starting' ? 'Joylashuv aniqlanmoqda…' : 'Joylashuv ulashilmayapti'}</strong>
      <span className="t-caption">{tracker.message || (tracker.sentAt ? `Oxirgi yuborish: ${agoText(Math.round((Date.now() - tracker.sentAt) / 1000))}. Faqat faol yetkazish vaqtida, ilova ochiq turganda.` : 'Faqat faol yetkazish vaqtida, ilova ochiq turganda.')}</span></div>
  </div>;
}
