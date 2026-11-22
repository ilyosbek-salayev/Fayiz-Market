// Customer account, delivery location, tracking, confirmation and review screens.
// API calls are passed in from main.tsx; business rules are enforced by the Worker.
import { useCallback, useEffect, useRef, useState } from 'react';
import { money } from '@fayz/shared';
import { Icon } from '../../../packages/ui/src/Icon';
import { friendlyError } from '../../../packages/ui/src/format';
import { MapView, currentPosition, directionsLink, formatCoords, mapsLink, type LatLng, type MapMarker } from '../../../packages/ui/src/maps';
import { openExternal } from '../../../packages/ui/src/native';
import { agoText, stageIndex, stageNames, stageSteps } from '../../../packages/ui/src/stages';
import { Field, Sheet, revealOnFocus } from './components';

export type Api = <T>(path: string, init?: RequestInit) => Promise<T>;
export type AuthConfig = { phone: { enabled: boolean; devEcho: boolean }; telegram: { enabled: boolean; botUsername: string | null; botId: string | null }; password: boolean };
export type Customer = { id: number; name: string; phone: string | null; phoneVerified: boolean; telegram: { username: string | null } | null; hasPassword: boolean };
export type DeliveryLocation = LatLng & { accuracy?: number; address?: string };
export type OrderView = {
  id: number; orderNumber: string; status: string; stage: string; total: number; createdAt: string; customerName: string; phone: string; address: string;
  items: { productId: number; name: string; price: number; quantity: number }[];
  location: { lat: number; lng: number; details: string } | null;
  delivery: null | { status: string; courier: { name: string; phone: string | null } | null; pickedUpAt: string | null; arrivedAt: string | null; handedOverAt: string | null };
  canConfirm: boolean; canReview: boolean; reviewed: { products: number[]; courier: boolean; courierRatable: boolean };
};
const PHONE = /^\+998\d{9}$/;

// ---------------------------------------------------------------- Authentication
type Mode = 'login' | 'register' | 'reset';
export function AuthSheet({ api, config, initialMode = 'login', onDone, onClose }: { api: Api; config: AuthConfig | null; initialMode?: Mode; onDone: (token: string, customer: Customer) => void; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('+998'); const [password, setPassword] = useState(''); const [name, setName] = useState(''); const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [info, setInfo] = useState(''); const [devCode, setDevCode] = useState('');
  const [resendAt, setResendAt] = useState(0); const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const smsReady = !!config?.phone.enabled;
  const switchMode = (next: Mode) => { setMode(next); setStep('phone'); setError(''); setInfo(''); setCode(''); setDevCode(''); };
  const run = async (task: () => Promise<void>) => { setBusy(true); setError(''); try { await task(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } };
  const requestCode = () => run(async () => {
    if (!PHONE.test(phone)) throw new Error('Raqamni +998 va 9 ta raqam bilan kiriting');
    const r = await api<{ resendIn: number; devCode?: string }>('/auth/otp', { method: 'POST', body: JSON.stringify({ phone, purpose: mode === 'reset' ? 'reset' : 'register' }) });
    setResendAt(Date.now() + r.resendIn * 1000); setDevCode(r.devCode || ''); setStep('code');
    setInfo(mode === 'reset' ? 'Agar bu raqam roʻyxatdan oʻtgan boʻlsa, unga SMS kod yuborildi.' : `${phone} raqamiga SMS kod yuborildi.`);
  });
  const finish = () => run(async () => {
    if (!/^\d{6}$/.test(code)) throw new Error('SMS dagi 6 xonali kodni kiriting');
    if (password.length < 10) throw new Error('Parol kamida 10 ta belgidan iborat boʻlsin');
    const r = mode === 'register'
      ? await api<{ token: string; customer: Customer }>('/auth/register', { method: 'POST', body: JSON.stringify({ phone, code, password, name }) })
      : await api<{ token: string; customer: Customer }>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ phone, code, password }) });
    onDone(r.token, r.customer);
  });
  const login = () => run(async () => {
    if (!PHONE.test(phone)) throw new Error('Raqamni +998 va 9 ta raqam bilan kiriting');
    const r = await api<{ token: string; customer: Customer }>('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) });
    onDone(r.token, r.customer);
  });
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const title = mode === 'login' ? 'Hisobga kirish' : mode === 'register' ? 'Roʻyxatdan oʻtish' : 'Parolni tiklash';
  const phoneField = <Field label="Telefon raqami" hint="Masalan: +998901234567"><input className="input num" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+]/g, ''))} onFocus={revealOnFocus} disabled={step === 'code'} /></Field>;
  return <Sheet title={title} onClose={onClose}>
    <div className="form-stack auth-form">
      {mode !== 'reset' && <div className="segmented" role="tablist"><button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Kirish</button><button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Roʻyxatdan oʻtish</button></div>}
      {error && <div className="banner banner-error" role="alert"><Icon name="alert" size={20} /><div>{error}</div></div>}
      {info && !error && <div className="banner banner-info" role="status"><Icon name="phone" size={20} /><div>{info}</div></div>}
      {devCode && <div className="banner banner-warning" role="status"><Icon name="key" size={20} /><div><strong>Sinov serveri</strong>SMS yuborilmadi, kod: <span className="num">{devCode}</span>. Productionda bu koʻrinmaydi.</div></div>}
      {mode === 'login' && <>
        {phoneField}
        <Field label="Parol"><input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} onFocus={revealOnFocus} /></Field>
        <button className="btn btn-primary btn-lg btn-block" onClick={login} disabled={busy}>{busy ? <><span className="spinner" />Tekshirilmoqda...</> : 'Kirish'}</button>
        <button className="link-btn" onClick={() => switchMode('reset')}>Parolni unutdingizmi?</button>
      </>}
      {mode !== 'login' && !smsReady && <div className="banner banner-warning"><Icon name="alert" size={20} /><div><strong>SMS tasdiqlash hozircha ishlamaydi</strong>Doʻkon SMS xizmatini ulagach, telefon orqali roʻyxatdan oʻtish mumkin boʻladi.{config?.telegram.enabled ? ' Hozir Telegram orqali kirishingiz mumkin.' : ''}</div></div>}
      {mode !== 'login' && smsReady && step === 'phone' && <>
        {phoneField}
        <button className="btn btn-primary btn-lg btn-block" onClick={requestCode} disabled={busy}>{busy ? <><span className="spinner" />Yuborilmoqda...</> : 'SMS kod olish'}</button>
      </>}
      {mode !== 'login' && smsReady && step === 'code' && <>
        {phoneField}
        <Field label="SMS kod"><input className="input num otp-single" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} onFocus={revealOnFocus} placeholder="••••••" /></Field>
        <div className="resend"><button className="link-btn plain" onClick={() => { setStep('phone'); setInfo(''); }}>Raqamni oʻzgartirish</button>{wait > 0 ? <span className="num">Qayta yuborish: {wait} s</span> : <button className="link-btn plain" onClick={requestCode} disabled={busy}>Kodni qayta yuborish</button>}</div>
        {mode === 'register' && <Field label="Ismingiz"><input className="input" autoComplete="name" value={name} onChange={e => setName(e.target.value)} onFocus={revealOnFocus} /></Field>}
        <Field label={mode === 'register' ? 'Parol' : 'Yangi parol'} hint="Kamida 10 ta belgi"><input className="input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} onFocus={revealOnFocus} /></Field>
        <button className="btn btn-primary btn-lg btn-block" onClick={finish} disabled={busy || (mode === 'register' && name.trim().length < 2)}>{busy ? <><span className="spinner" />Tekshirilmoqda...</> : mode === 'register' ? 'Hisob yaratish' : 'Parolni saqlash'}</button>
      </>}
      {mode === 'reset' && <button className="link-btn" onClick={() => switchMode('login')}>Kirish sahifasiga qaytish</button>}
      {config?.telegram.enabled && mode !== 'reset' && <>
        <div className="divider-text">yoki</div>
        <button className="btn btn-telegram btn-lg btn-block" onClick={() => startTelegram('login', config)}><Icon name="send" size={20} />Telegram orqali kirish</button>
        <p className="t-caption center">Telegram faqat ismingiz va username’ingizni beradi. Telefon raqami alohida SMS bilan tasdiqlanadi.</p>
      </>}
    </div>
  </Sheet>;
}

/** Official Telegram OAuth redirect: Telegram signs the result and returns it to this page in #tgAuthResult. */
export function startTelegram(intent: 'login' | 'link', config: AuthConfig) {
  if (!config.telegram.botId) return;
  sessionStorage.setItem('fayz_tg_intent', intent);
  const origin = location.origin, back = origin + location.pathname;
  location.href = `https://oauth.telegram.org/auth?bot_id=${config.telegram.botId}&origin=${encodeURIComponent(origin)}&embed=0&request_access=write&return_to=${encodeURIComponent(back)}`;
}
export function takeTelegramResult(): { intent: string; auth: Record<string, string> } | null {
  const raw = location.hash.match(/tgAuthResult=([A-Za-z0-9_\-+/=%]+)/)?.[1];
  if (!raw) return null;
  history.replaceState(null, '', location.pathname);
  try {
    const json = atob(decodeURIComponent(raw).replace(/-/g, '+').replace(/_/g, '/'));
    const intent = sessionStorage.getItem('fayz_tg_intent') || 'login'; sessionStorage.removeItem('fayz_tg_intent');
    return { intent, auth: JSON.parse(decodeURIComponent(escape(json))) };
  } catch { return null; }
}

/** Telegram-only accounts confirm a phone number with an SMS code before ordering under their account. */
export function LinkPhoneSheet({ api, config, onDone, onClose }: { api: Api; config: AuthConfig | null; onDone: (c: Customer) => void; onClose: () => void }) {
  const [phone, setPhone] = useState('+998'); const [code, setCode] = useState(''); const [sent, setSent] = useState(false); const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const run = async (task: () => Promise<void>) => { setBusy(true); setError(''); try { await task(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } };
  return <Sheet title="Telefonni tasdiqlash" onClose={onClose}><div className="form-stack">
    {!config?.phone.enabled && <div className="banner banner-warning"><Icon name="alert" size={20} /><div>SMS tasdiqlash hozircha ishlamaydi.</div></div>}
    {error && <div className="banner banner-error" role="alert"><Icon name="alert" size={20} /><div>{error}</div></div>}
    {devCode && <div className="banner banner-warning"><Icon name="key" size={20} /><div>Sinov serveri kodi: <span className="num">{devCode}</span></div></div>}
    <Field label="Telefon raqami"><input className="input num" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+]/g, ''))} disabled={sent} /></Field>
    {sent && <Field label="SMS kod"><input className="input num otp-single" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></Field>}
    {!sent ? <button className="btn btn-primary btn-lg btn-block" disabled={busy || !config?.phone.enabled} onClick={() => run(async () => { if (!PHONE.test(phone)) throw new Error('Raqamni +998 va 9 ta raqam bilan kiriting'); const r = await api<{ devCode?: string }>('/auth/otp', { method: 'POST', body: JSON.stringify({ phone, purpose: 'link' }) }); setDevCode(r.devCode || ''); setSent(true); })}>SMS kod olish</button>
      : <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => run(async () => { const r = await api<{ customer: Customer }>('/auth/phone/link', { method: 'POST', body: JSON.stringify({ phone, code }) }); onDone(r.customer); })}>Tasdiqlash</button>}
  </div></Sheet>;
}

// ---------------------------------------------------------------- Delivery location
export function LocationSheet({ apiKey, initial, onConfirm, onClose }: { apiKey?: string; initial: DeliveryLocation | null; onConfirm: (l: DeliveryLocation) => void; onClose: () => void }) {
  const [center, setCenter] = useState<LatLng | null>(initial);
  const [picked, setPicked] = useState<DeliveryLocation | null>(initial);
  const [address, setAddress] = useState(initial?.address || ''); const [accuracy, setAccuracy] = useState<number | undefined>(initial?.accuracy);
  const [locating, setLocating] = useState(false); const [error, setError] = useState('');
  const onPick = useCallback((p: LatLng) => { setPicked(old => ({ ...p, accuracy: old && Math.abs(old.lat - p.lat) < 1e-6 && Math.abs(old.lng - p.lng) < 1e-6 ? old.accuracy : undefined })); }, []);
  const locate = async () => {
    setLocating(true); setError('');
    try { const p = await currentPosition(); setCenter({ lat: p.lat, lng: p.lng }); setPicked(p); setAccuracy(p.accuracy); }
    catch (e) { setError(friendlyError(e)); } finally { setLocating(false); }
  };
  const mapOn = !!apiKey;
  return <Sheet title="Yetkazish joyi" onClose={onClose} footer={<><button className="btn btn-primary btn-lg btn-block" disabled={!picked} onClick={() => picked && onConfirm({ lat: picked.lat, lng: picked.lng, accuracy: picked.accuracy ?? accuracy, address })}><Icon name="check" size={20} />Shu joyni tasdiqlash</button><button className="btn btn-quiet btn-block" onClick={onClose}>Bekor qilish</button></>}>
    <div className="form-stack">
      <p className="t-caption">{mapOn ? 'Xaritani suring — qizil pin yetkazish nuqtasini koʻrsatadi. GPS aniqligi har doim ham toʻliq emas, pinni toʻgʻrilab qoʻying.' : 'Joriy joylashuvingizni aniqlang. Xarita ulangach, pinni qoʻlda ham surish mumkin boʻladi.'}</p>
      <MapView apiKey={apiKey} center={center} picker onPick={onPick} onAddress={setAddress} className="tall" />
      <button className="btn btn-secondary btn-block" onClick={locate} disabled={locating}>{locating ? <><span className="spinner" />Aniqlanmoqda...</> : <><Icon name="target" size={18} />Joylashuvimni aniqlash</>}</button>
      {error && <div className="banner banner-warning" role="alert"><Icon name="alert" size={20} /><div>{error}</div></div>}
      {picked && <div className="loc-summary"><Icon name="pin" size={20} /><div><strong>{address || 'Tanlangan nuqta'}</strong><span className="t-caption num">{formatCoords(picked)}{(picked.accuracy ?? accuracy) ? ` · ±${picked.accuracy ?? accuracy} m` : ''}</span></div></div>}
    </div>
  </Sheet>;
}

// ---------------------------------------------------------------- Tracking
type Tracking = { stage: string; destination: (LatLng & { details: string; address: string }) | null; store: (LatLng & { address: string }) | null; courier: (LatLng & { accuracy: number | null; ageSeconds: number; live: boolean }) | null };
export function TrackingSheet({ api, order, headers, apiKey, onClose, onChanged }: { api: Api; order: OrderView; headers: Record<string, string>; apiKey?: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<Tracking | null>(null); const [error, setError] = useState('');
  const stageRef = useRef(order.stage);
  const load = useCallback(async () => {
    try { const t = await api<Tracking>(`/orders/${order.id}/tracking`, { headers }); setData(t); setError(''); if (t.stage !== stageRef.current) { stageRef.current = t.stage; onChanged(); } }
    catch (e) { setError(friendlyError(e)); }
  }, [order.id]);
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10000); return () => clearInterval(t); }, [load]);
  const markers: MapMarker[] = [];
  if (data?.destination) markers.push({ ...data.destination, kind: 'destination', title: 'Yetkazish manzili' });
  if (data?.courier) markers.push({ lat: data.courier.lat, lng: data.courier.lng, kind: 'courier', title: 'Kuryer' });
  if (data?.store && !data.courier) markers.push({ ...data.store, kind: 'store', title: 'Doʻkon' });
  const stage = data?.stage || order.stage, at = stageIndex(stage);
  const courier = order.delivery?.courier;
  return <Sheet title={order.orderNumber} onClose={onClose}>
    <div className="form-stack">
      <div className="track-head"><span className={`badge badge-${stage === 'delivered' ? 'delivered' : 'shipped'}`}>{stageNames[stage] || stage}</span>
        {data?.courier ? <span className="t-caption track-age"><span className={`live-dot${data.courier.live ? '' : ' stale'}`} />{data.courier.live ? `Kuryer joylashuvi · ${agoText(data.courier.ageSeconds)}` : `Oxirgi maʼlum joy · ${agoText(data.courier.ageSeconds)}`}</span>
          : <span className="t-caption">{['picked_up', 'on_the_way', 'arrived'].includes(stage) ? 'Kuryer joylashuvi hali kelmadi' : 'Kuryer yoʻlga chiqqach joylashuvi koʻrinadi'}</span>}
      </div>
      {error && <div className="banner banner-warning"><Icon name="wifiOff" size={20} /><div>{error}</div></div>}
      {data?.courier && !data.courier.live && <div className="banner banner-warning"><Icon name="clock" size={20} /><div>Joylashuv {agoText(data.courier.ageSeconds)} yangilangan — kuryer internetsiz boʻlishi mumkin. Bu jonli holat emas.</div></div>}
      {markers.length > 0 && <MapView apiKey={apiKey} markers={markers} fit className="tall" />}
      {markers.length > 0 && <div className="legend"><span><i className="dot-destination" />Siz</span>{data?.courier && <span><i className="dot-courier" />Kuryer</span>}{data?.store && !data.courier && <span><i className="dot-store" />Doʻkon</span>}</div>}
      {courier && <div className="courier-card"><span className="avatar-sm"><Icon name="courier" size={20} /></span><div><span className="t-caption">Kuryer</span><strong>{courier.name}</strong></div>{courier.phone && <button className="btn btn-sm btn-secondary" onClick={() => openExternal(`tel:${courier.phone}`)}><Icon name="phone" size={16} />Qoʻngʻiroq</button>}</div>}
      <ol className="timeline">{stageSteps.map(([key, label], i) => <li key={key} className={i < at || stage === 'delivered' ? 'done' : i === at ? 'current' : ''}>{label}</li>)}</ol>
    </div>
  </Sheet>;
}

// ---------------------------------------------------------------- Confirmation & reviews
export function ConfirmDelivery({ busy, onConfirm, onDispute, compact }: { busy: boolean; onConfirm: () => void; onDispute: (reason: string) => void; compact?: boolean }) {
  const [disputing, setDisputing] = useState(false); const [reason, setReason] = useState('');
  return <div className={`confirm-card${compact ? ' compact' : ''}`} role="region" aria-label="Qabul qilishni tasdiqlash">
    <div className="confirm-head"><span className="confirm-icon"><Icon name="check" size={22} stroke={2.2} /></span><div><strong>Buyurtmani qabul qilganingizni tasdiqlang</strong><span className="t-caption">Kuryer topshirganini qayd etdi. Mahsulotni olgan boʻlsangiz, tasdiqlang.</span></div></div>
    {!disputing ? <div className="confirm-actions"><button className="btn btn-primary" disabled={busy} onClick={onConfirm}>{busy ? <span className="spinner" /> : <Icon name="check" size={18} />}Ha, qabul qildim</button><button className="btn btn-quiet" disabled={busy} onClick={() => setDisputing(true)}>Olmadim</button></div>
      : <div className="form-stack"><Field label="Nima boʻldi?"><textarea className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Masalan: buyurtma menga topshirilmadi" onFocus={revealOnFocus} /></Field><div className="confirm-actions"><button className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => onDispute(reason.trim())}>Doʻkonga xabar berish</button><button className="btn btn-quiet" onClick={() => setDisputing(false)}>Orqaga</button></div></div>}
  </div>;
}

export function StarInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return <div className="stars" role="radiogroup" aria-label={label}>{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} yulduz`} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}><Icon name="star" size={28} filled={n <= value} stroke={1.4} /></button>)}</div>;
}
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return <span className="stars-static" aria-label={`${value} / 5`}>{[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= Math.round(value) ? '' : 'off'}><Icon name="star" size={size} filled stroke={1} /></span>)}</span>;
}

export function ReviewSheet({ api, order, headers, onDone, onClose }: { api: Api; order: OrderView; headers: Record<string, string>; onDone: () => void; onClose: () => void }) {
  const products = order.items.filter((item, i, all) => all.findIndex(x => x.productId === item.productId) === i && !order.reviewed.products.includes(item.productId));
  const [ratings, setRatings] = useState<Record<number, { rating: number; body: string }>>({});
  const [courier, setCourier] = useState({ rating: 0, body: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const rateCourier = order.reviewed.courierRatable && !order.reviewed.courier;
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const payload = { products: Object.entries(ratings).filter(([, r]) => r.rating > 0).map(([id, r]) => ({ productId: Number(id), rating: r.rating, body: r.body.trim() })), ...(rateCourier && courier.rating ? { courier: { rating: courier.rating, body: courier.body.trim() } } : {}) };
      await api(`/orders/${order.id}/reviews`, { method: 'POST', headers, body: JSON.stringify(payload) });
      onDone();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  const any = Object.values(ratings).some(r => r.rating > 0) || courier.rating > 0;
  return <Sheet title="Baholash" onClose={onClose} footer={<><button className="btn btn-primary btn-lg btn-block" disabled={busy || !any} onClick={submit}>{busy ? <><span className="spinner" />Yuborilmoqda...</> : 'Bahoni yuborish'}</button><button className="btn btn-quiet btn-block" onClick={onClose}>Keyinroq</button></>}>
    <div className="form-stack">
      <p className="t-caption">Bahoyingiz boshqa xaridorlarga yordam beradi. Faqat qabul qilingan buyurtmalar baholanadi.</p>
      {error && <div className="banner banner-error"><Icon name="alert" size={20} /><div>{error}</div></div>}
      {products.map(item => { const r = ratings[item.productId] || { rating: 0, body: '' }; return <section key={item.productId} className="review-item">
        <strong>{item.name}</strong>
        <StarInput label={`${item.name} bahosi`} value={r.rating} onChange={n => setRatings({ ...ratings, [item.productId]: { ...r, rating: n } })} />
        {r.rating > 0 && <textarea className="input" rows={2} maxLength={1000} placeholder="Fikringiz (ixtiyoriy)" value={r.body} onChange={e => setRatings({ ...ratings, [item.productId]: { ...r, body: e.target.value } })} onFocus={revealOnFocus} />}
      </section>; })}
      {rateCourier && <section className="review-item"><strong>Kuryer xizmati</strong><StarInput label="Kuryer bahosi" value={courier.rating} onChange={n => setCourier({ ...courier, rating: n })} />{courier.rating > 0 && <textarea className="input" rows={2} maxLength={500} placeholder="Kuryer haqida (ixtiyoriy)" value={courier.body} onChange={e => setCourier({ ...courier, body: e.target.value })} onFocus={revealOnFocus} />}</section>}
    </div>
  </Sheet>;
}

type Reviews = { count: number; average: number | null; reviews: { rating: number; body: string; authorName: string; createdAt: string }[] };
export function ProductReviews({ api, slug }: { api: Api; slug: string }) {
  const [data, setData] = useState<Reviews | null>(null);
  useEffect(() => { let live = true; api<Reviews>(`/products/${encodeURIComponent(slug)}/reviews`).then(r => live && setData(r)).catch(() => live && setData(null)); return () => { live = false; }; }, [slug]);
  if (!data) return null;
  return <div className="detail-reviews">
    <div className="reviews-head"><h2 className="t-label">Sharhlar</h2>{data.count > 0 && <span className="reviews-avg"><Stars value={data.average || 0} /><strong className="num">{data.average}</strong><span className="t-caption num">({data.count})</span></span>}</div>
    {!data.count ? <p className="t-caption">Hali sharh yoʻq. Sharhni faqat mahsulotni xarid qilib, qabul qilgan mijozlar yoza oladi.</p>
      : <ul className="review-list">{data.reviews.map((r, i) => <li key={i}><div className="review-meta"><Stars value={r.rating} size={13} /><span className="t-caption">{r.authorName}</span></div>{r.body && <p className="t-body">{r.body}</p>}</li>)}</ul>}
  </div>;
}

export const orderMoney = money;
export { directionsLink, mapsLink };
