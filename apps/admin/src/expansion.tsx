// Admin-side expansion screens: order delivery block, staff, integrations, reviews, password,
// image capture/upload and the notification poller. Permissions are enforced by the API.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../../packages/ui/src/Icon';
import { formatDateTime, friendlyError } from '../../../packages/ui/src/format';
import { MapView, formatCoords, mapsLink, type MapMarker } from '../../../packages/ui/src/maps';
import { systemNotify } from '../../../packages/ui/src/native';
import { agoText, deliveryNames } from '../../../packages/ui/src/stages';
import { EmptyState, Field, Modal, Panel } from './components';

export type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
export type Delivery = { courierId: number; courierName: string; courierPhone: string; status: string; version: number; declineReason: string; assignedAt: string; acceptedAt: string | null; pickedUpAt: string | null; arrivedAt: string | null; handedOverAt: string | null; confirmedAt: string | null };
export type OrderExtras = { delivery: Delivery | null; events: { event: string; actorType: string; detail: string; createdAt: string }[]; courierLocation: { lat: number; lng: number; ageSeconds: number } | null; courierRating: { rating: number; body: string } | null; reviews: { id: number; rating: number; body: string; status: string; productName: string }[] };
type OrderBase = { id: number; status: string; address: string; location: { lat: number; lng: number; details: string } | null; fulfillment?: string };
type Courier = { id: number; name: string; phone: string; active: number; activeDeliveries: number; rating: number | null };

const eventNames: Record<string, string> = {
  order_created: 'Buyurtma yaratildi', status_confirmed: 'Tasdiqlandi', status_preparing: 'Tayyorlanmoqda', status_shipped: 'Yoʻlga chiqarildi', status_delivered: 'Yetkazildi (admin)', status_cancelled: 'Bekor qilindi',
  courier_assigned: 'Kuryer tayinlandi', courier_reassigned: 'Kuryer almashtirildi', courier_accept: 'Kuryer qabul qildi', courier_decline: 'Kuryer rad etdi', courier_pickup: 'Kuryer olib ketdi',
  courier_depart: 'Kuryer yoʻlga chiqdi', courier_arrive: 'Kuryer yetib keldi', courier_handover: 'Kuryer topshirdi', delivery_confirmed: 'Mijoz qabul qilganini tasdiqladi',
  delivery_disputed: 'Mijoz eʼtiroz bildirdi', delivery_resolved: 'Administrator hal qildi', reviewed: 'Mijoz baholadi',
};
const REASSIGNABLE = ['assigned', 'accepted', 'declined', 'cancelled'];

export function OrderDelivery({ order, extras, request, mapsKey, onChanged }: { order: OrderBase; extras: OrderExtras | null; request: Request; mapsKey?: string; onChanged: () => void }) {
  const [couriers, setCouriers] = useState<Courier[]>([]); const [courierId, setCourierId] = useState(0);
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const d = extras?.delivery;
  const pickup = order.fulfillment === 'pickup';
  const canAssign = !pickup && ['confirmed', 'preparing'].includes(order.status) && (!d || REASSIGNABLE.includes(d.status));
  useEffect(() => { if (canAssign) request<{ couriers: Courier[] }>('/admin/couriers').then(r => setCouriers(r.couriers.filter(c => c.active))).catch(e => setError(friendlyError(e))); }, [canAssign]);
  const run = async (task: () => Promise<unknown>) => { setBusy(true); setError(''); try { await task(); onChanged(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } };
  if (pickup) return <section className="od-block"><h4>Qabul qilish</h4><div className="facts"><div><Icon name="store" size={18} /><span>Mijoz buyurtmani doʻkondan oʻzi olib ketadi — kuryer kerak emas. Tayyor boʻlganda holatni «Olib ketishga tayyor»ga oʻtkazing.</span></div></div></section>;
  const markers: MapMarker[] = [];
  if (order.location) markers.push({ lat: order.location.lat, lng: order.location.lng, kind: 'destination', title: 'Mijoz manzili' });
  if (extras?.courierLocation) markers.push({ lat: extras.courierLocation.lat, lng: extras.courierLocation.lng, kind: 'courier', title: 'Kuryer' });
  return <>
    <section className="od-block"><h4>Yetkazish manzili</h4>
      {order.location ? <div className="form-stack">
        <MapView apiKey={mapsKey} markers={markers} fit={markers.length > 1} />
        <div className="facts"><div><Icon name="pin" size={18} /><span className="num">{formatCoords(order.location)}</span></div>{order.location.details && <div><Icon name="note" size={18} /><span>{order.location.details}</span></div>}</div>
        <a className="btn btn-sm btn-secondary" href={mapsLink(order.location)} target="_blank" rel="noopener"><Icon name="navigation" size={16} />Google Maps’da ochish</a>
        {extras?.courierLocation && <p className="t-caption"><span className={`live-dot${extras.courierLocation.ageSeconds <= 120 ? '' : ' stale'}`} /> Kuryer joylashuvi: {agoText(extras.courierLocation.ageSeconds)}</p>}
      </div> : <p className="t-caption">Mijoz xaritada nuqta belgilamagan — faqat matnli manzil bor.</p>}
    </section>
    <section className="od-block"><h4>Kuryer</h4>
      {error && <div className="banner banner-error"><Icon name="alert" size={20} /><div>{error}</div></div>}
      {d && <div className="courier-line"><span className="avatar-sm"><Icon name="courier" size={18} /></span><div><strong>{d.courierName}</strong><span className="t-caption num">{d.courierPhone}</span></div><span className={`badge ${['confirmed', 'resolved'].includes(d.status) ? 'badge-delivered' : ['declined', 'disputed', 'cancelled'].includes(d.status) ? 'badge-cancelled' : 'badge-shipped'}`}>{deliveryNames[d.status] || d.status}</span></div>}
      {d?.status === 'declined' && d.declineReason && <p className="t-caption">Rad etish sababi: {d.declineReason}</p>}
      {canAssign && (couriers.length ? <div className="assign-row">
        <select className="input" value={courierId} onChange={e => setCourierId(Number(e.target.value))} aria-label="Kuryer"><option value={0}>Kuryerni tanlang</option>{couriers.filter(c => c.id !== d?.courierId || d?.status === 'declined').map(c => <option key={c.id} value={c.id}>{c.name} · {c.activeDeliveries ? `${c.activeDeliveries} ta faol` : 'boʻsh'}{c.rating ? ` · ★${c.rating}` : ''}</option>)}</select>
        <button className="btn btn-primary" disabled={busy || !courierId} onClick={() => run(() => request(`/admin/orders/${order.id}/assign`, { method: 'POST', body: JSON.stringify({ courierId, ...(d ? { version: d.version } : {}) }) }))}>{d ? 'Qayta tayinlash' : 'Tayinlash'}</button>
      </div> : <p className="t-caption">Faol kuryer yoʻq. Sozlamalar → Xodimlar boʻlimida kuryer qoʻshing.</p>)}
      {!d && !canAssign && order.status === 'new' && <p className="t-caption">Kuryer tayinlash uchun avval buyurtmani tasdiqlang.</p>}
      {d && ['handed_over', 'disputed'].includes(d.status) && <div className="resolve-box">
        <p className="t-caption">{d.status === 'disputed' ? 'Mijoz buyurtmani olmaganini bildirdi. Tekshirib, natijani yozing.' : 'Mijoz tasdigʻi kutilmoqda. Mijoz tasdiqlay olmasa, tekshirib qoʻlda yakunlang.'}</p>
        <Field label="Sabab / tekshiruv natijasi" hint="Audit jurnaliga yoziladi"><textarea className="input" rows={2} value={reason} onChange={e => setReason(e.target.value)} /></Field>
        <button className="btn btn-secondary" disabled={busy || reason.trim().length < 5} onClick={() => run(() => request(`/admin/orders/${order.id}/resolve`, { method: 'POST', body: JSON.stringify({ outcome: 'delivered', reason: reason.trim() }) }))}>Yetkazilgan deb yakunlash</button>
      </div>}
    </section>
    {extras && extras.events.length > 0 && <section className="od-block"><h4>Tarix</h4><ul className="event-list">{extras.events.map((e, i) => <li key={i}><span>{eventNames[e.event] || e.event}{e.detail && !e.detail.startsWith('{') ? <span className="t-caption"> — {e.detail}</span> : null}</span><span className="t-caption nowrap">{formatDateTime(e.createdAt)}</span></li>)}</ul></section>}
    {extras && (extras.courierRating || extras.reviews.length > 0) && <section className="od-block"><h4>Mijoz bahosi</h4><ul className="event-list">
      {extras.courierRating && <li><span>Kuryer: {'★'.repeat(extras.courierRating.rating)}{extras.courierRating.body ? ` — ${extras.courierRating.body}` : ''}</span></li>}
      {extras.reviews.map(r => <li key={r.id}><span>{r.productName}: {'★'.repeat(r.rating)}{r.body ? ` — ${r.body}` : ''}</span>{r.status === 'hidden' && <span className="badge plain">Yashirin</span>}</li>)}
    </ul></section>}
  </>;
}

// ---------------------------------------------------------------- Staff
type StaffUser = { id: number; email: string; role: string; name: string; phone: string; active: number };
export const roleNames: Record<string, string> = { owner: 'Super admin', manager: 'Admin', courier: 'Kuryer' };
export function StaffPanel({ request, meId }: { request: Request; meId?: number }) {
  const [users, setUsers] = useState<StaffUser[]>([]); const [form, setForm] = useState({ email: '', password: '', role: 'courier', name: '', phone: '+998' });
  const [reset, setReset] = useState<StaffUser | null>(null); const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = useCallback(() => request<{ users: StaffUser[] }>('/admin/users').then(r => setUsers(r.users)).catch(e => setError(friendlyError(e))), []);
  useEffect(() => { void load(); }, [load]);
  const run = async (task: () => Promise<unknown>, done: string) => { setBusy(true); setError(''); setNotice(''); try { await task(); setNotice(done); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } };
  return <Panel title="Xodimlar" subtitle="Super admin, admin va kuryerlar. Kuryer shu ilovaga kirib, faqat oʻz yetkazishlarini koʻradi.">
    {error && <div className="banner banner-error"><Icon name="alert" size={20} /><div>{error}</div></div>}
    {notice && <div className="banner banner-success"><Icon name="check" size={20} /><div>{notice}</div></div>}
    <ul className="rows">{users.map(user => <li key={user.id} className={user.active ? '' : 'inactive'}>
      <span className="row-initial" aria-hidden="true">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
      <div className="row-main"><strong className="break">{user.name || user.email}</strong><span className="t-caption break">{user.name ? user.email : ''}{user.phone ? ` · ${user.phone}` : ''}</span></div>
      <span className={`badge plain ${user.role === 'owner' ? 'badge-confirmed' : user.role === 'courier' ? 'badge-shipped' : ''}`}>{roleNames[user.role] || user.role}</span>
      {!user.active && <span className="badge plain badge-cancelled">Oʻchirilgan</span>}
      {user.id !== meId && <div className="acts">
        <button type="button" className="act act-icon" title="Parolni tiklash" onClick={() => { setReset(user); setNewPassword(''); }} disabled={busy}><Icon name="key" size={17} /><span className="visually-hidden">Parolni tiklash</span></button>
        <button type="button" className={`act act-icon${user.active ? ' act-danger' : ''}`} title={user.active ? 'Oʻchirish' : 'Faollashtirish'} onClick={() => run(() => request(`/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) }), user.active ? 'Xodim oʻchirildi, sessiyalari yopildi' : 'Xodim faollashtirildi')} disabled={busy}><Icon name={user.active ? 'lock' : 'check'} size={17} /><span className="visually-hidden">{user.active ? 'Oʻchirish' : 'Faollashtirish'}</span></button>
      </div>}
    </li>)}</ul>
    <form className="add-admin" onSubmit={e => { e.preventDefault(); void run(async () => { await request('/admin/users', { method: 'POST', body: JSON.stringify({ ...form, phone: form.phone === '+998' ? '' : form.phone }) }); setForm({ email: '', password: '', role: 'courier', name: '', phone: '+998' }); }, 'Xodim qoʻshildi'); }}>
      <h4>Xodim qoʻshish</h4>
      <div className="form-grid three">
        <Field label="Rol"><select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="courier">Kuryer</option><option value="manager">Admin (menejer)</option><option value="owner">Super admin</option></select></Field>
        <Field label="Ism"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required={form.role === 'courier'} minLength={2} /></Field>
        <Field label="Telefon" hint={form.role === 'courier' ? 'Mijoz kuryerga qoʻngʻiroq qiladi' : 'Ixtiyoriy'}><input className="input num" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} pattern={form.role === 'courier' ? '\\+998\\d{9}' : undefined} /></Field>
        <Field label="Email (login)"><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required autoComplete="off" /></Field>
        <Field label="Parol" hint="Kamida 10 ta belgi"><input className="input" type="password" minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required autoComplete="new-password" /></Field>
      </div>
      <div className="form-actions"><button className="btn btn-secondary" disabled={busy}><Icon name="plus" size={18} />Qoʻshish</button></div>
    </form>
    {reset && <Modal as="form" size="sm" title="Parolni tiklash" subtitle={reset.name || reset.email} onClose={() => setReset(null)} onSubmit={e => { e.preventDefault(); const u = reset; setReset(null); void run(() => request(`/admin/users/${u.id}/password`, { method: 'POST', body: JSON.stringify({ password: newPassword }) }), 'Yangi parol oʻrnatildi. Xodimga xavfsiz yoʻl bilan yetkazing.'); }} footer={<><button type="button" className="btn btn-quiet" onClick={() => setReset(null)}>Bekor qilish</button><button className="btn btn-primary" disabled={newPassword.length < 10}>Saqlash</button></>}>
      <Field label="Yangi parol" hint="Kamida 10 ta belgi. Xodimning barcha sessiyalari yopiladi."><input className="input" type="password" minLength={10} value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" /></Field>
    </Modal>}
  </Panel>;
}

export function PasswordPanel({ request }: { request: Request }) {
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return <Panel title="Parolni oʻzgartirish" subtitle="Boshqa qurilmalardagi sessiyalaringiz yopiladi">
    <form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); setResult(null); try { await request('/admin/password', { method: 'POST', body: JSON.stringify({ currentPassword: current, password: next }) }); setCurrent(''); setNext(''); setResult({ ok: true, text: 'Parol yangilandi' }); } catch (err) { setResult({ ok: false, text: friendlyError(err) }); } finally { setBusy(false); } }}>
      <Field label="Joriy parol"><input className="input" type="password" value={current} onChange={e => setCurrent(e.target.value)} required autoComplete="current-password" /></Field>
      <Field label="Yangi parol" hint="Kamida 10 ta belgi"><input className="input" type="password" minLength={10} value={next} onChange={e => setNext(e.target.value)} required autoComplete="new-password" /></Field>
      {result && <div className={`banner ${result.ok ? 'banner-success' : 'banner-error'} wide`}><Icon name={result.ok ? 'check' : 'alert'} size={20} /><div>{result.text}</div></div>}
      <div className="form-actions"><button className="btn btn-secondary" disabled={busy}>Parolni saqlash</button></div>
    </form>
  </Panel>;
}

// ---------------------------------------------------------------- Integrations
type SecretInfo = { name: string; label: string; hint?: string; multiline: boolean; present: boolean; source: 'panel' | 'cloudflare' | null; stored: boolean; unreadable: boolean; updatedAt: string | null };
type Integration = { key: string; legacy?: boolean; group: 'maps' | 'auth' | 'notify' | 'payments'; name: string; purpose: string; billing: string; setup: string[]; testable: boolean; testKind: 'live' | 'sandbox' | 'internal'; configured: boolean; status: 'configured' | 'not_configured' | 'error'; enabled: boolean; toggleable: boolean; fields: { key: string; label: string; placeholder?: string; hint?: string; options?: [string, string][]; value: string }[]; secrets: SecretInfo[]; lastCheck: { ok: boolean; message: string; at: string; kind?: string } | null };
const groups: [Integration['group'], string][] = [['payments', 'Toʻlovlar'], ['maps', 'Xarita va marshrut'], ['auth', 'Kirish va tasdiqlash'], ['notify', 'Bildirishnomalar']];
const statusText = { configured: 'Ulangan', not_configured: 'Sozlanmagan', error: 'Xato' } as const;
const statusBadge = { configured: 'badge-ok', not_configured: 'badge-preparing', error: 'badge-cancelled' } as const;
const testKindText: Record<string, string> = { live: 'Haqiqiy ulanish', sandbox: 'Sandbox', internal: 'Ichki tekshiruv' };
export function IntegrationsView({ request }: { request: Request }) {
  const [data, setData] = useState<{ masterKey: { configured: boolean; id: string | null }; integrations: Integration[] } | null>(null); const [error, setError] = useState('');
  const load = useCallback(() => request<{ masterKey: { configured: boolean; id: string | null }; integrations: Integration[] }>('/admin/integrations').then(r => { setData(r); setError(''); }).catch(e => setError(friendlyError(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (error && !data) return <Panel><EmptyState icon="alert" title="Integratsiyalar yuklanmadi" text={error} /></Panel>;
  if (!data) return <div className="integrations">{[0, 1, 2].map(i => <div key={i} className="panel"><div className="skeleton" style={{ height: 90 }} /></div>)}</div>;
  return <div className="integrations">
    {data.masterKey.configured
      ? <div className="banner banner-info"><Icon name="shield" size={20} /><div><strong>Kalitlar shifrlangan holda saqlanadi</strong>Panelda kiritilgan maxfiy kalitlar AES-256-GCM bilan shifrlanadi; shifrlash kaliti Cloudflare secret’da (bazada emas). Kiritilgan qiymat hech qachon qayta koʻrsatilmaydi — faqat «kiritilgan» holati.</div></div>
      : <div className="banner banner-warning"><Icon name="lock" size={20} /><div><strong>Shifrlash kaliti oʻrnatilmagan</strong>Maxfiy kalitlarni paneldan saqlash uchun bir martalik sozlash kerak (dasturchi yoki egasi bajaradi): <code>openssl rand -base64 32 | npx wrangler secret put INTEGRATIONS_MASTER_KEY --env production</code> (apps/api papkasida). Ungacha kalitlar faqat Cloudflare secret orqali qoʻshiladi; ochiq maydonlar ishlayveradi.</div></div>}
    {groups.map(([group, title]) => { const items = data.integrations.filter(i => i.group === group && !i.legacy); return items.length ? <section key={group} className="integration-group"><h2 className="group-title">{title}</h2>{items.map(item => <IntegrationCard key={item.key} item={item} request={request} canStore={data.masterKey.configured} onSaved={load} />)}</section> : null; })}
  </div>;
}
function IntegrationCard({ item, request, canStore, onSaved }: { item: Integration; request: Request; canStore: boolean; onSaved: () => void }) {
  const [values, setValues] = useState(Object.fromEntries(item.fields.map(f => [f.key, f.value])));
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<{ ok: boolean; message: string; kind?: string } | null>(null); const [open, setOpen] = useState(item.status !== 'configured');
  useEffect(() => setValues(Object.fromEntries(item.fields.map(f => [f.key, f.value]))), [JSON.stringify(item.fields)]);
  const fieldsDirty = item.fields.some(f => (values[f.key] ?? '') !== f.value);
  const run = async (task: () => Promise<{ ok?: boolean; message?: string; kind?: string } | unknown>, done: string) => { setBusy(true); setResult(null); try { const r = await task() as { ok?: boolean; message?: string; kind?: string }; setResult(r && typeof r.ok === 'boolean' && r.message ? { ok: r.ok, message: r.message, kind: r.kind } : { ok: true, message: done }); onSaved(); } catch (e) { setResult({ ok: false, message: friendlyError(e) }); } finally { setBusy(false); } };
  const typed = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v.trim()));
  return <section className="panel integration">
    <div className="integration-head"><div><h3>{item.name}</h3><p className="t-caption">{item.purpose}</p></div><div className="badges"><span className={`badge ${statusBadge[item.status]}`}>{statusText[item.status]}</span>{item.toggleable && <span className={`badge plain ${item.enabled ? 'badge-ok' : ''}`}>{item.enabled ? 'Faol' : 'Oʻchiq'}</span>}</div></div>
    {item.lastCheck && <p className={`t-caption check-line ${item.lastCheck.ok ? 'ok' : 'bad'}`}><Icon name={item.lastCheck.ok ? 'check' : 'alert'} size={14} />Oxirgi tekshiruv ({formatDateTime(item.lastCheck.at)}{item.lastCheck.kind ? `, ${testKindText[item.lastCheck.kind] || item.lastCheck.kind}` : ''}): {item.lastCheck.message}</p>}
    <button type="button" className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Yopish' : 'Sozlash'}<Icon name="chevron" size={16} /></button>
    {open && <div className="form-stack">
      <p className="t-caption"><strong>Narx:</strong> {item.billing}</p>
      {item.fields.length > 0 && <div className="form-grid">{item.fields.map(f => <Field key={f.key} label={f.label} hint={f.hint}>{f.options
        ? <select className="input" value={values[f.key] || ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })}>{f.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
        : <input className="input" value={values[f.key] || ''} placeholder={f.placeholder} onChange={e => setValues({ ...values, [f.key]: e.target.value })} autoComplete="off" spellCheck={false} />}</Field>)}</div>}
      {item.fields.length > 0 && <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy || !fieldsDirty} onClick={() => run(() => request(`/admin/integrations/${item.key}`, { method: 'PUT', body: JSON.stringify(values) }), 'Saqlandi')}>Maydonlarni saqlash</button></div>}
      {item.secrets.length > 0 && <div className="secret-block">
        <span className="field-label">Maxfiy kalitlar</span>
        <ul className="secret-list">{item.secrets.map(sc => <li key={sc.name}>
          <div className="secret-head"><div><strong>{sc.label}</strong><code>{sc.name}</code></div>
            <span className={`badge plain ${sc.unreadable ? 'badge-cancelled' : sc.present ? 'badge-ok' : ''}`}>{sc.unreadable ? 'Shifr kaliti mos emas' : sc.source === 'panel' ? `Kiritilgan · panel${sc.updatedAt ? ' · ' + formatDateTime(sc.updatedAt) : ''}` : sc.source === 'cloudflare' ? 'Kiritilgan · Cloudflare' : 'Kiritilmagan'}</span></div>
          {canStore && (sc.multiline
            ? <textarea className="input mono" rows={4} placeholder={sc.present ? 'Almashtirish uchun yangi qiymatni joylang' : sc.hint || 'Qiymatni joylang'} value={secrets[sc.name] || ''} onChange={e => setSecrets({ ...secrets, [sc.name]: e.target.value })} autoComplete="off" spellCheck={false} />
            : <input className="input mono" type="password" placeholder={sc.present ? '•••••••• (almashtirish uchun yangisini kiriting)' : sc.hint || 'Qiymat'} value={secrets[sc.name] || ''} onChange={e => setSecrets({ ...secrets, [sc.name]: e.target.value })} autoComplete="new-password" spellCheck={false} />)}
          {canStore && sc.stored && <button type="button" className="link-btn danger-text" disabled={busy} onClick={() => run(() => request(`/admin/integrations/${item.key}/secrets/${sc.name}`, { method: 'DELETE' }), 'Kalit oʻchirildi')}>Paneldagi qiymatni oʻchirish</button>}
        </li>)}</ul>
        {canStore && <div className="form-actions"><button type="button" className="btn btn-primary" disabled={busy || !Object.keys(typed).length} onClick={() => run(async () => { await request(`/admin/integrations/${item.key}/secrets`, { method: 'PUT', body: JSON.stringify(typed) }); setSecrets({}); }, 'Kalitlar shifrlangan holda saqlandi')}><Icon name="lock" size={18} />Kalitlarni saqlash</button></div>}
      </div>}
      <ol className="setup-steps">{item.setup.map((step, i) => <li key={i}>{step}</li>)}</ol>
      {result && <div className={`banner ${result.ok ? 'banner-success' : 'banner-error'}`}><Icon name={result.ok ? 'check' : 'alert'} size={20} /><div>{result.kind && <strong>{testKindText[result.kind] || result.kind}</strong>}{result.message}</div></div>}
      <div className="form-actions">
        {item.testable && <button type="button" className="btn btn-secondary" disabled={busy || !item.configured} onClick={() => run(() => request(`/admin/integrations/${item.key}/test`, { method: 'POST' }), '')}>{busy ? <span className="spinner" /> : <Icon name="plug" size={18} />}Ulanishni tekshirish</button>}
        {item.toggleable && <button type="button" className={`btn ${item.enabled ? 'btn-quiet' : 'btn-primary'}`} disabled={busy || (!item.enabled && !item.configured)} onClick={() => run(() => request(`/admin/integrations/${item.key}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) }), item.enabled ? 'Oʻchirildi — checkoutda koʻrinmaydi' : 'Faollashtirildi — checkoutda koʻrinadi')}>{item.enabled ? 'Oʻchirish' : 'Faollashtirish'}</button>}
      </div>
    </div>}
  </section>;
}

// ---------------------------------------------------------------- Reviews moderation
type Review = { id: number; rating: number; body: string; status: string; authorName: string; createdAt: string; productName: string; orderNumber: string };
export function ReviewsView({ request }: { request: Request }) {
  const [data, setData] = useState<{ reviews: Review[]; courierRatings: { orderId: number; rating: number; body: string; createdAt: string; courierName: string; orderNumber: string }[] } | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(0);
  const load = useCallback(() => request<any>('/admin/reviews').then(setData).catch(e => setError(friendlyError(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (error && !data) return <Panel><EmptyState icon="alert" title="Sharhlar yuklanmadi" text={error} /></Panel>;
  if (!data) return <Panel><div className="skeleton" style={{ height: 120 }} /></Panel>;
  const toggle = async (r: Review) => { setBusy(r.id); try { await request(`/admin/reviews/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: r.status === 'published' ? 'hidden' : 'published' }) }); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(0); } };
  return <div className="settings">
    {error && <div className="banner banner-error"><Icon name="alert" size={20} /><div>{error}</div></div>}
    <Panel title="Mahsulot sharhlari" subtitle="Faqat yetkazilgan va mijoz tasdiqlagan buyurtmalardan">
      {!data.reviews.length ? <EmptyState icon="star" title="Hali sharh yoʻq" text="Mijozlar buyurtmani qabul qilgach baho qoldiradi." /> :
        <ul className="rows review-rows">{data.reviews.map(r => <li key={r.id} className={r.status === 'hidden' ? 'inactive' : ''}><span className="review-stars" aria-label={`${r.rating}/5`}>{'★'.repeat(r.rating)}<span className="off">{'★'.repeat(5 - r.rating)}</span></span><div className="row-main"><strong className="break">{r.productName}</strong><span className="t-caption">{r.authorName} · <span className="num">{r.orderNumber}</span> · {formatDateTime(r.createdAt)}</span>{r.body && <span className="review-body">{r.body}</span>}</div><button type="button" className="btn btn-sm btn-secondary" disabled={busy === r.id} onClick={() => toggle(r)}>{r.status === 'published' ? 'Yashirish' : 'Koʻrsatish'}</button></li>)}</ul>}
    </Panel>
    <Panel title="Kuryer baholari">
      {!data.courierRatings.length ? <p className="t-caption">Hali baho yoʻq.</p> :
        <ul className="rows">{data.courierRatings.map(r => <li key={r.orderId}><span className="review-stars">{'★'.repeat(r.rating)}<span className="off">{'★'.repeat(5 - r.rating)}</span></span><div className="row-main"><strong>{r.courierName}</strong><span className="t-caption"><span className="num">{r.orderNumber}</span> · {formatDateTime(r.createdAt)}</span>{r.body && <span className="review-body">{r.body}</span>}</div></li>)}</ul>}
    </Panel>
  </div>;
}

// ---------------------------------------------------------------- Product photo: gallery or camera
/** Resizes to ≤1600 px, applies EXIF orientation, re-encodes to JPEG (small PNGs are kept as they are). */
export async function prepareImage(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !file.type.startsWith('image/')) throw new Error('Faqat rasm fayli tanlang');
  if (!file.size) throw new Error('Fayl boʻsh yoki oʻqib boʻlmadi. Boshqa rasm tanlang');
  if (file.size > 25_000_000) throw new Error('Rasm juda katta (25 MB dan oshmasin)');
  if (file.type === 'image/png' && file.size < 600_000) return file;
  let source: ImageBitmap | HTMLImageElement;
  try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { source = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Rasmni oʻqib boʻlmadi (format qoʻllab-quvvatlanmaydi)')); img.src = URL.createObjectURL(file); }); }
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Rasmni tayyorlab boʻlmadi');
  if (blob.size > 5_000_000) throw new Error('Rasm siqilgandan keyin ham 5 MB dan katta');
  return blob;
}

export function ImagePicker({ disabled, upload }: { disabled?: boolean; upload: (blob: Blob, progress: (p: number) => void) => Promise<void> }) {
  const [pending, setPending] = useState<{ blob: Blob; url: string; source: 'gallery' | 'camera' } | null>(null);
  const [progress, setProgress] = useState(-1); const [error, setError] = useState('');
  const gallery = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);
  const choose = async (file: File | undefined, source: 'gallery' | 'camera') => {
    if (!file) return; setError('');
    try { const blob = await prepareImage(file); setPending({ blob, url: URL.createObjectURL(blob), source }); } catch (e) { setError(friendlyError(e)); }
  };
  const send = async () => {
    if (!pending) return; setProgress(0); setError('');
    try { await upload(pending.blob, setProgress); setPending(null); } catch (e) { setError(friendlyError(e)); } finally { setProgress(-1); }
  };
  return <div className="image-picker">
    <input ref={gallery} type="file" accept="image/*" hidden onChange={e => { void choose(e.target.files?.[0], 'gallery'); e.target.value = ''; }} />
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => { void choose(e.target.files?.[0], 'camera'); e.target.value = ''; }} />
    {!pending ? <div className="picker-buttons">
      <button type="button" className="image-upload" onClick={() => gallery.current?.click()} disabled={disabled}><Icon name="image" size={22} /><span>Galereyadan tanlash</span><small>JPG, PNG, WEBP</small></button>
      <button type="button" className="image-upload" onClick={() => camera.current?.click()} disabled={disabled}><Icon name="camera" size={22} /><span>Kamerada suratga olish</span><small>Galereyaga saqlanmaydi</small></button>
    </div> : <div className="picker-preview">
      <img src={pending.url} alt="Tanlangan rasm" />
      <div className="picker-side">
        <span className="t-caption num">{Math.max(1, Math.round(pending.blob.size / 1024))} KB · yuklashga tayyor</span>
        {progress >= 0 ? <><div className="progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div><span className="t-caption num">Yuklanmoqda: {progress}%</span></>
          : <div className="picker-actions"><button type="button" className="btn btn-sm btn-primary" onClick={send}><Icon name="upload" size={16} />Yuklash</button><button type="button" className="btn btn-sm btn-secondary" onClick={() => (pending.source === 'camera' ? camera : gallery).current?.click()}>{pending.source === 'camera' ? 'Qayta olish' : 'Boshqasini tanlash'}</button><button type="button" className="btn btn-sm btn-quiet" onClick={() => setPending(null)}>Bekor qilish</button></div>}
      </div>
    </div>}
    {error && <div className="banner banner-error"><Icon name="alert" size={20} /><div>{error}</div></div>}
  </div>;
}

// ---------------------------------------------------------------- Notifications
export type Notice = { id: number; kind: string; title: string; body: string; orderId: number | null; createdAt: string };
/** Polls the staff/courier feed while the app runs. The first poll on a device only sets the baseline. */
export function useNotifications(request: Request, key: string, enabled: boolean, onNew: (n: Notice[]) => void) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const storageKey = `fayz_notice_seen_${key}`;
    const poll = async () => {
      try {
        const seen = Number(localStorage.getItem(storageKey) || 0);
        const r = await request<{ latest: number; notifications: Notice[] }>(`/admin/notifications?after=${seen}`);
        if (stopped) return;
        if (!seen) { localStorage.setItem(storageKey, String(r.latest)); return; }
        const fresh = r.notifications.filter(n => n.id > seen);
        if (fresh.length) { localStorage.setItem(storageKey, String(Math.max(...fresh.map(n => n.id)))); fresh.slice(0, 5).reverse().forEach(n => systemNotify(`n${n.id}`, n.title, n.body, n.orderId ?? undefined)); onNew(fresh); }
      } catch { /* offline: try again on the next tick */ }
    };
    void poll(); const t = setInterval(poll, 20000);
    return () => { stopped = true; clearInterval(t); };
  }, [enabled, key]);
}
