// Admin screens for the V1 storefront: brand & appearance, store location, checkout payment methods, home-screen
// banners, order payment handling and the per-device admin theme. Permissions are enforced by the API.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { money } from '@fayz/shared';
import { Icon } from '../../../packages/ui/src/Icon';
import { BrandMark, type Brand } from '../../../packages/ui/src/brand';
import { formatDateTime, friendlyError } from '../../../packages/ui/src/format';
import { MapView, currentPosition, formatCoords, type LatLng } from '../../../packages/ui/src/maps';
import { BannerCard, paymentMethodNames, paymentStatusBadge, paymentStatusNames, type Banner } from '../../../packages/ui/src/storefront';
import { ConfirmDialog, EmptyState, Field, Modal, Panel, Toggle } from './components';
import { ImagePicker, type Request } from './expansion';
import { NumberInput } from '../../../packages/ui/src/NumberInput';

export type Upload = (path: string, blob: Blob, progress?: (p: number) => void) => Promise<any>;
type Result = { ok: boolean; text: string } | null;
const Notice = ({ result }: { result: Result }) => result ? <div className={`banner ${result.ok ? 'banner-success' : 'banner-error'}`} role={result.ok ? 'status' : 'alert'}><Icon name={result.ok ? 'check' : 'alert'} size={20} /><div>{result.text}</div></div> : null;

// ---------------------------------------------------------------- Theme (this device only)
export type AdminTheme = 'light' | 'dark' | 'system';
export function useAdminTheme(): [AdminTheme, (t: AdminTheme) => void, boolean] {
  const [mode, setMode] = useState<AdminTheme>(() => (localStorage.getItem('fayz_admin_theme') as AdminTheme) || 'light');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => { const q = window.matchMedia?.('(prefers-color-scheme: dark)'); if (!q) return; const on = (e: MediaQueryListEvent) => setSystemDark(e.matches); q.addEventListener('change', on); return () => q.removeEventListener('change', on); }, []);
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  useEffect(() => { localStorage.setItem('fayz_admin_theme', mode); document.documentElement.dataset.theme = dark ? 'black' : 'yellow'; }, [mode, dark]);
  return [mode, setMode, dark];
}
export function ThemePanel({ mode, setMode }: { mode: AdminTheme; setMode: (t: AdminTheme) => void }) {
  return <Panel title="Koʻrinish" subtitle="Faqat shu qurilmada. Logotip mavzuga mos (yorugʻ/qorongʻi) avtomatik tanlanadi.">
    <div className="segmented" role="group" aria-label="Mavzu">{([['light', 'Yorugʻ'], ['dark', 'Qorongʻi'], ['system', 'Tizim boʻyicha']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}</div>
  </Panel>;
}

// ---------------------------------------------------------------- Logo preparation (client side)
/** Checks a chosen logo and re-encodes it as a ≤ 512 px PNG (transparency kept) before upload. */
export async function prepareLogo(file: File): Promise<Blob> {
  if (!/^image\/(png|webp|jpeg)$/.test(file.type)) throw new Error('Logo PNG, WebP yoki JPEG boʻlishi kerak (SVG qabul qilinmaydi)');
  if (file.size > 10_000_000) throw new Error('Fayl juda katta (10 MB dan oshmasin)');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Rasmni oʻqib boʻlmadi'); });
  const ratio = bitmap.width / bitmap.height;
  if (bitmap.width < 128 || bitmap.height < 128) throw new Error('Logo kamida 128×128 px boʻlishi kerak');
  if (ratio < 0.8 || ratio > 1.25) throw new Error('Logo kvadratga yaqin boʻlishi kerak — u ilova belgisi sifatida ishlatiladi');
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
  if (blob && blob.size > 950_000) blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/webp', 0.92));
  if (!blob) throw new Error('Logoni tayyorlab boʻlmadi');
  return blob;
}

// ---------------------------------------------------------------- Brand & appearance
type History = { id: number; variant: 'light' | 'dark'; url: string; createdAt: string };
export function BrandPanel({ request, upload, canEdit, onSaved }: { request: Request; upload: Upload; canEdit: boolean; onSaved: (b: Brand) => void }) {
  const [server, setServer] = useState<{ brand: Brand; history: History[] } | null>(null);
  const [form, setForm] = useState<Brand | null>(null);
  const [busy, setBusy] = useState<string>(''); const [result, setResult] = useState<Result>(null);
  const files = { light: useRef<HTMLInputElement>(null), dark: useRef<HTMLInputElement>(null) };
  const load = useCallback(() => request<{ brand: Brand; history: History[] }>('/admin/branding').then(r => { setServer(r); setForm(r.brand); }).catch(e => setResult({ ok: false, text: friendlyError(e) })), []);
  useEffect(() => { void load(); }, [load]);
  if (!form || !server) return <Panel title="Brend va koʻrinish">{result ? <Notice result={result} /> : <div className="skeleton" style={{ height: 120 }} />}</Panel>;
  const dirty = JSON.stringify(form) !== JSON.stringify(server.brand);
  const pick = async (variant: 'light' | 'dark', file?: File) => {
    if (!file) return; setBusy(variant); setResult(null);
    try { const blob = await prepareLogo(file); const r = await upload('/admin/branding/logo', blob); setForm(f => f && ({ ...f, [variant === 'light' ? 'logoLight' : 'logoDark']: r.url })); setResult({ ok: true, text: 'Logo yuklandi. Koʻrinishni tekshirib, «Saqlash»ni bosing.' }); }
    catch (e) { setResult({ ok: false, text: friendlyError(e) }); } finally { setBusy(''); }
  };
  const save = async () => { setBusy('save'); setResult(null); try { const r = await request<{ brand: Brand }>('/admin/branding', { method: 'PUT', body: JSON.stringify(form) }); await load(); onSaved(r.brand); setResult({ ok: true, text: 'Saqlandi. Mijoz va admin ilovalarida yangi APK’siz koʻrinadi.' }); } catch (e) { setResult({ ok: false, text: friendlyError(e) }); } finally { setBusy(''); } };
  const previous = (variant: 'light' | 'dark') => [...new Set(server.history.filter(h => h.variant === variant).map(h => h.url))].filter(u => u !== (variant === 'light' ? form.logoLight : form.logoDark)).slice(0, 4);
  const slot = (variant: 'light' | 'dark') => {
    const key = variant === 'light' ? 'logoLight' : 'logoDark', url = form[key], dark = variant === 'dark';
    return <div className="logo-slot">
      <div className={`logo-stage${dark ? ' on-dark' : ''}`}>
        <BrandMark size={88} dark={dark} brand={{ ...form, logoLight: dark ? '' : url, logoDark: dark ? url : '' }} />
        <div className="logo-sizes"><BrandMark size={40} dark={dark} brand={{ ...form, logoLight: dark ? '' : url, logoDark: dark ? url : '' }} /><BrandMark size={24} dark={dark} brand={{ ...form, logoLight: dark ? '' : url, logoDark: dark ? url : '' }} /></div>
      </div>
      <div className="logo-meta"><strong>{dark ? 'Dark Mode logotipi' : 'Light Mode logotipi'}</strong><span className="t-caption">{url ? 'Yuklangan logo' : 'Ilova ichidagi tasdiqlangan logo'}</span></div>
      {canEdit && <div className="logo-actions">
        <input ref={files[variant]} type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={e => { void pick(variant, e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => files[variant].current?.click()}>{busy === variant ? <span className="spinner" /> : <Icon name="upload" size={16} />}Yangi logo</button>
        {url && <button type="button" className="btn btn-sm btn-quiet" disabled={!!busy} onClick={() => setForm({ ...form, [key]: '' })}>Standart logoga qaytarish</button>}
      </div>}
      {canEdit && previous(variant).length > 0 && <div className="logo-history"><span className="t-caption">Avvalgi logotiplar:</span>{previous(variant).map(u => <button key={u || 'builtin'} type="button" className="logo-prev" title={u ? 'Shu logoga qaytarish' : 'Standart logo'} onClick={() => setForm({ ...form, [key]: u })}><BrandMark size={32} dark={dark} brand={{ ...form, logoLight: dark ? '' : u, logoDark: dark ? u : '' }} /></button>)}</div>}
    </div>;
  };
  return <Panel className="stack-panel" title="Brend va koʻrinish" subtitle="Logotip, nom va qisqa tavsif. Ilova ichida darhol yangilanadi.">
    <Notice result={result} />
    <div className="form-grid">
      <Field label="Brend nomi"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} readOnly={!canEdit} maxLength={60} /></Field>
      <Field label="Qisqa tavsif" hint="Bosh sahifada nom ostida"><input className="input" value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} readOnly={!canEdit} maxLength={80} /></Field>
    </div>
    <div className="logo-grid">{slot('light')}{slot('dark')}</div>
    <div className="app-preview" aria-label="Bosh sahifa sarlavhasi koʻrinishi">
      {(['light', 'dark'] as const).map(v => <div key={v} className={`app-preview-head${v === 'dark' ? ' on-dark' : ''}`}><BrandMark size={36} dark={v === 'dark'} brand={form} /><div><strong>{form.name || 'Fayz Market'}</strong><span>{form.tagline}</span></div><span className="app-preview-go"><Icon name="directions" size={20} /></span></div>)}
    </div>
    <p className="t-caption">PNG, WebP yoki JPEG; kvadratga yaqin; kamida 128 px; 1 MB gacha (ilova oʻzi 512 px gacha kichraytiradi). Android ilova belgisi, bildirishnoma belgisi va kompyuter dasturi belgisi operatsion tizimga tegishli — ular faqat yangi APK/DMG/EXE bilan oʻzgaradi.</p>
    {canEdit && <div className="form-actions end"><button type="button" className="btn btn-quiet" disabled={!dirty || !!busy} onClick={() => { setForm(server.brand); setResult(null); }}>Bekor qilish</button><button type="button" className="btn btn-primary" disabled={!dirty || !!busy || form.name.trim().length < 2} onClick={save}>{busy === 'save' ? <><span className="spinner" />Saqlanmoqda...</> : 'Saqlash'}</button></div>}
  </Panel>;
}

// ---------------------------------------------------------------- Store location
export function StorePanel({ request, canEdit, mapsKey, settings, onSaved }: { request: Request; canEdit: boolean; mapsKey?: string; settings: Record<string, string>; onSaved: () => void }) {
  const initial = useMemo(() => ({ placeName: settings.store_place_name || '', address: settings.store_address || '', lat: settings.store_lat || '', lng: settings.store_lng || '' }), [settings.store_place_name, settings.store_address, settings.store_lat, settings.store_lng]);
  const [form, setForm] = useState(initial); const [busy, setBusy] = useState(false); const [result, setResult] = useState<Result>(null);
  const parsed = (v: string) => { const n = Number(v); return v.trim() && Number.isFinite(n) ? n : null; };
  const [center, setCenter] = useState<LatLng | null>(() => parsed(initial.lat) != null && parsed(initial.lng) != null ? { lat: parsed(initial.lat)!, lng: parsed(initial.lng)! } : null);
  useEffect(() => { setForm(initial); }, [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const lat = parsed(form.lat), lng = parsed(form.lng);
  const valid = form.address.trim().length >= 5 && lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const save = async () => { setBusy(true); setResult(null); try { await request('/admin/store', { method: 'PUT', body: JSON.stringify({ placeName: form.placeName.trim(), address: form.address.trim(), lat, lng }) }); setResult({ ok: true, text: 'Doʻkon joylashuvi saqlandi. Mijozlar bosh sahifada va xaritada koʻradi.' }); onSaved(); } catch (e) { setResult({ ok: false, text: friendlyError(e) }); } finally { setBusy(false); } };
  const here = async () => { setResult(null); try { const p = await currentPosition(); setCenter({ lat: p.lat, lng: p.lng }); setForm(f => ({ ...f, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) })); } catch (e) { setResult({ ok: false, text: friendlyError(e) }); } };
  return <Panel className="stack-panel" title="Doʻkon joylashuvi" subtitle="Mijoz bosh sahifasi, «Doʻkonga yoʻl» xaritasi, olib ketish va kuryer marshruti shu nuqtadan foydalanadi">
    <Notice result={result} />
    <div className="form-grid">
      <Field label="Manzil nomi" hint="Masalan: Fayz Market — Chilonzor"><input className="input" value={form.placeName} onChange={e => setForm({ ...form, placeName: e.target.value })} readOnly={!canEdit} maxLength={80} /></Field>
      <Field label="Toʻliq manzil" wide><input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} readOnly={!canEdit} maxLength={300} placeholder="Shahar, tuman, koʻcha, uy, moʻljal" /></Field>
      <Field label="Kenglik (latitude)"><input className="input num" inputMode="decimal" value={form.lat} onChange={e => { setForm({ ...form, lat: e.target.value }); const n = parsed(e.target.value); if (n != null && lng != null) setCenter({ lat: n, lng }); }} readOnly={!canEdit} placeholder="41.311081" /></Field>
      <Field label="Uzunlik (longitude)"><input className="input num" inputMode="decimal" value={form.lng} onChange={e => { setForm({ ...form, lng: e.target.value }); const n = parsed(e.target.value); if (n != null && lat != null) setCenter({ lat, lng: n }); }} readOnly={!canEdit} placeholder="69.240562" /></Field>
    </div>
    {canEdit ? <><p className="t-caption">Xaritani suring — qizil pin doʻkon nuqtasini belgilaydi. Koordinatalar avtomatik yoziladi.</p>
      <MapView apiKey={mapsKey} center={center} picker onPick={p => setForm(f => ({ ...f, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }))} className="tall" /></>
      : lat != null && lng != null && <MapView apiKey={mapsKey} markers={[{ lat, lng, kind: 'store', title: form.placeName || 'Doʻkon' }]} />}
    {lat != null && lng != null && <p className="t-caption num">Tanlangan nuqta: {formatCoords({ lat, lng })}</p>}
    {canEdit && <div className="form-actions end"><button type="button" className="btn btn-quiet" onClick={here}><Icon name="target" size={18} />Hozirgi joylashuvim</button><button type="button" className="btn btn-quiet" disabled={!dirty || busy} onClick={() => { setForm(initial); setResult(null); }}>Bekor qilish</button><button type="button" className="btn btn-primary" disabled={!dirty || !valid || busy} onClick={save}>{busy ? <><span className="spinner" />Saqlanmoqda...</> : 'Saqlash'}</button></div>}
  </Panel>;
}

// ---------------------------------------------------------------- Checkout payment methods
export function PaymentSettingsPanel({ request, canEdit, settings, onSaved, openIntegrations }: { request: Request; canEdit: boolean; settings: Record<string, string>; onSaved: () => void; openIntegrations: () => void }) {
  const initial = useMemo(() => ({ cash: (settings.payment_cash ?? '1') === '1', cardTerminal: settings.payment_card_terminal === '1', bankTransfer: settings.payment_bank_transfer === '1', bankTransferDetails: settings.bank_transfer_details || '', pickup: settings.fulfillment_pickup === '1', deliveryFee: Number(settings.delivery_fee) || 0, deliveryFreeFrom: Number(settings.delivery_free_from) || 0 }), [settings]);
  const [form, setForm] = useState(initial); const [busy, setBusy] = useState(false); const [result, setResult] = useState<Result>(null);
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const save = async () => { setBusy(true); setResult(null); try { await request('/admin/payment-settings', { method: 'PUT', body: JSON.stringify(form) }); setResult({ ok: true, text: 'Saqlandi. Checkoutda faqat yoqilgan usullar koʻrinadi.' }); onSaved(); } catch (e) { setResult({ ok: false, text: friendlyError(e) }); } finally { setBusy(false); } };
  const online = (key: 'payme' | 'click') => settings[`${key}_enabled`] === '1' ? <span className="badge badge-ok plain">Faol</span> : <span className="badge plain">Oʻchiq</span>;
  return <Panel className="stack-panel" title="Toʻlov va qabul qilish" subtitle="Xaridor checkoutda tanlay oladigan usullar">
    <Notice result={result} />
    <div className="toggles">
      <Toggle label="Naqd pul" hint="Yetkazilganda yoki olib ketishda. Pul olingach xodim qayd etadi" checked={form.cash} onChange={v => canEdit && setForm({ ...form, cash: v })} />
      <Toggle label="Karta — terminal orqali" hint="Kuryer yoki doʻkondagi terminal; chek raqami bilan qayd etiladi" checked={form.cardTerminal} onChange={v => canEdit && setForm({ ...form, cardTerminal: v })} />
      <Toggle label="Bank oʻtkazmasi" hint="Xaridor rekvizitlarga oʻtkazadi; pul tushgach xodim tasdiqlaydi" checked={form.bankTransfer} onChange={v => canEdit && setForm({ ...form, bankTransfer: v })} />
      <Toggle label="Doʻkondan olib ketish" hint="Yetkazib berishdan tashqari, doʻkon manzili koʻrsatiladi" checked={form.pickup} onChange={v => canEdit && setForm({ ...form, pickup: v })} />
    </div>
    <div className="form-grid">
      <Field label="Yetkazib berish narxi (kuryer xizmati)" hint="Buyurtma summasiga alohida qoʻshiladi. 0 — bepul"><NumberInput value={form.deliveryFee} onChange={deliveryFee => canEdit && setForm(f => ({ ...f, deliveryFee }))} readOnly={!canEdit} max={10_000_000} suffix="soʻm" aria-label="Yetkazib berish narxi" /></Field>
      <Field label="Bepul yetkazib berish chegarasi" hint="Mahsulotlar shu summadan oshsa, yetkazish bepul. 0 — chegara yoʻq"><NumberInput value={form.deliveryFreeFrom} onChange={deliveryFreeFrom => canEdit && setForm(f => ({ ...f, deliveryFreeFrom }))} readOnly={!canEdit} suffix="soʻm" aria-label="Bepul yetkazib berish chegarasi" /></Field>
    </div>
    {form.bankTransfer && <Field label="Bank rekvizitlari" hint="Xaridorga koʻrsatiladi: oluvchi, bank, hisob raqami, MFO, INN"><textarea className="input" rows={4} value={form.bankTransferDetails} onChange={e => setForm({ ...form, bankTransferDetails: e.target.value })} readOnly={!canEdit} maxLength={600} /></Field>}
    <div className="online-methods"><div><strong>Payme</strong>{online('payme')}</div><div><strong>Click</strong>{online('click')}</div><button type="button" className="link-btn" onClick={openIntegrations}>Integratsiyalarda sozlash<Icon name="chevron" size={16} /></button></div>
    <p className="t-caption">Onlayn toʻlov faqat merchant shartnomasi va kalitlari kiritilib, «Faol» yoqilgandan keyin checkoutda chiqadi. Buyurtma yaratilishi «toʻlandi» degani emas.</p>
    {canEdit && <div className="form-actions end"><button type="button" className="btn btn-quiet" disabled={!dirty || busy} onClick={() => { setForm(initial); setResult(null); }}>Bekor qilish</button><button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? <><span className="spinner" />Saqlanmoqda...</> : 'Saqlash'}</button></div>}
  </Panel>;
}

// ---------------------------------------------------------------- Banners
const targetNames: [string, string][] = [['none', 'Havolasiz'], ['catalog', 'Katalog'], ['store', 'Doʻkon xaritasi'], ['category', 'Kategoriya'], ['product', 'Mahsulot']];
const emptyBanner: Banner = { id: 0, title: '', subtitle: '', ctaLabel: '', ctaTarget: 'none', imageUrl: '', tone: 'accent', active: true, position: 0 };
export function BannersView({ request, upload, categories, settings, onDefaultSaved }: { request: Request; upload: Upload; categories: { id: number; name: string; slug: string }[]; settings: Record<string, string>; onDefaultSaved: () => void }) {
  const [banners, setBanners] = useState<Banner[] | null>(null); const [error, setError] = useState('');
  const [editing, setEditing] = useState<Banner | null>(null); const [removing, setRemoving] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<Result>(null);
  const [hero, setHero] = useState({ title: settings.banner_title || '', subtitle: settings.banner_subtitle || '' });
  useEffect(() => setHero({ title: settings.banner_title || '', subtitle: settings.banner_subtitle || '' }), [settings.banner_title, settings.banner_subtitle]);
  const load = useCallback(() => request<{ banners: Banner[] }>('/admin/banners').then(r => { setBanners(r.banners); setError(''); }).catch(e => setError(friendlyError(e))), []);
  useEffect(() => { void load(); }, [load]);
  const run = async (task: () => Promise<unknown>, text: string) => { setBusy(true); setResult(null); try { await task(); setResult({ ok: true, text }); await load(); } catch (e) { setResult({ ok: false, text: friendlyError(e) }); } finally { setBusy(false); } };
  const body = (b: Banner) => JSON.stringify({ title: b.title, subtitle: b.subtitle, ctaLabel: b.ctaTarget === 'none' ? '' : b.ctaLabel, ctaTarget: b.ctaTarget, imageUrl: b.imageUrl, tone: b.tone, active: b.active ?? true, position: b.position ?? 0 });
  if (error && !banners) return <Panel><EmptyState icon="alert" title="Bannerlar yuklanmadi" text={error} /></Panel>;
  const active = banners?.filter(b => b.active) || [];
  return <div className="settings">
    <Notice result={result} />
    <Panel title="Bannerlar" subtitle={banners ? `${active.length} ta faol · ${banners.length} ta jami. Faollari mijoz bosh sahifasida tartib boʻyicha chiqadi.` : 'Yuklanmoqda...'} actions={<button type="button" className="btn btn-primary" onClick={() => setEditing({ ...emptyBanner, position: (banners?.length || 0) + 1 })} disabled={busy}><Icon name="plus" size={18} /><span className="hide-xs">Banner qoʻshish</span></button>}>
      {!banners ? <div className="skeleton" style={{ height: 120 }} /> : !banners.length ? <EmptyState icon="image" title="Hali banner yoʻq" text="Bannerlar boʻlmasa, mijozlarga pastdagi standart banner koʻrinadi." action={<button type="button" className="btn btn-primary" onClick={() => setEditing({ ...emptyBanner, position: 1 })}><Icon name="plus" size={18} />Birinchi banner</button>} /> :
        <ul className="banner-list">{banners.map(b => <li key={b.id} className={b.active ? '' : 'inactive'}>
          <div className="banner-thumb"><BannerCard banner={b} /></div>
          <div className="banner-meta">
            <div className="badges"><span className={`badge plain ${b.active ? 'badge-ok' : ''}`}>{b.active ? 'Faol' : 'Yashirin'}</span><span className="badge plain">Tartib: {b.position}</span>{b.ctaTarget !== 'none' && <span className="badge plain">{targetNames.find(([k]) => b.ctaTarget.startsWith(k))?.[1]}</span>}</div>
            <div className="acts">
              <button type="button" className="act" onClick={() => setEditing(b)} disabled={busy}><Icon name="edit" size={17} /><span>Tahrirlash</span></button>
              <button type="button" className="act" onClick={() => run(() => request(`/admin/banners/${b.id}`, { method: 'PUT', body: body({ ...b, active: !b.active }) }), b.active ? 'Banner yashirildi' : 'Banner faollashtirildi')} disabled={busy}><Icon name={b.active ? 'eye' : 'check'} size={17} /><span>{b.active ? 'Yashirish' : 'Faollashtirish'}</span></button>
              <button type="button" className="act act-danger" onClick={() => setRemoving(b)} disabled={busy}><Icon name="trash" size={17} /><span>Oʻchirish</span></button>
            </div>
          </div>
        </li>)}</ul>}
    </Panel>
    <Panel className="stack-panel" title="Standart banner" subtitle="Faol banner boʻlmaganda koʻrinadi (yangi brend belgisi bilan)">
      <div className="form-grid">
        <Field label="Sarlavha"><input className="input" value={hero.title} maxLength={120} onChange={e => setHero({ ...hero, title: e.target.value })} /></Field>
        <Field label="Matn"><input className="input" value={hero.subtitle} maxLength={200} onChange={e => setHero({ ...hero, subtitle: e.target.value })} /></Field>
      </div>
      <div className="phone-frame"><BannerCard banner={{ title: hero.title || 'Fayz Market', subtitle: hero.subtitle, ctaLabel: 'Katalogni ochish', ctaTarget: 'catalog', imageUrl: '', tone: 'accent' }} /></div>
      <div className="form-actions end"><button type="button" className="btn btn-primary" disabled={busy || (hero.title === (settings.banner_title || '') && hero.subtitle === (settings.banner_subtitle || ''))} onClick={() => run(async () => { await request('/admin/banners-default', { method: 'PUT', body: JSON.stringify(hero) }); onDefaultSaved(); }, 'Standart banner saqlandi')}>Saqlash</button></div>
    </Panel>
    {editing && <BannerEditor banner={editing} categories={categories} upload={upload} busy={busy} onClose={() => setEditing(null)} onSave={b => run(async () => { await request(b.id ? `/admin/banners/${b.id}` : '/admin/banners', { method: b.id ? 'PUT' : 'POST', body: body(b) }); setEditing(null); }, b.id ? 'Banner saqlandi' : 'Banner qoʻshildi')} />}
    {removing && <ConfirmDialog title="Bannerni oʻchirish" text={`«${removing.title}» butunlay oʻchiriladi. Vaqtincha olib tashlash uchun «Yashirish»dan foydalaning.`} confirmLabel="Oʻchirish" busy={busy} onCancel={() => setRemoving(null)} onConfirm={() => { const b = removing; setRemoving(null); void run(() => request(`/admin/banners/${b.id}`, { method: 'DELETE' }), 'Banner oʻchirildi'); }} />}
  </div>;
}
function BannerEditor({ banner, categories, upload, busy, onClose, onSave }: { banner: Banner; categories: { id: number; name: string; slug: string }[]; upload: Upload; busy: boolean; onClose: () => void; onSave: (b: Banner) => void }) {
  const [b, setB] = useState(banner);
  const kind = b.ctaTarget.split(':')[0], ref = b.ctaTarget.includes(':') ? b.ctaTarget.slice(b.ctaTarget.indexOf(':') + 1) : '';
  const setTarget = (k: string, value = '') => setB({ ...b, ctaTarget: k === 'category' || k === 'product' ? `${k}:${value}` : k, ctaLabel: k === 'none' ? '' : b.ctaLabel || (k === 'catalog' ? 'Katalog' : k === 'store' ? 'Yoʻlni koʻrish' : 'Koʻrish') });
  const targetValid = kind === 'none' || kind === 'catalog' || kind === 'store' || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ref);
  const valid = b.title.trim().length >= 2 && targetValid && (kind === 'none' || b.ctaLabel.trim().length >= 2);
  return <Modal as="form" size="lg" title={b.id ? 'Bannerni tahrirlash' : 'Yangi banner'} onClose={onClose} onSubmit={e => { e.preventDefault(); if (valid) onSave(b); }} footer={<><button type="button" className="btn btn-quiet" onClick={onClose}>Bekor qilish</button><button className="btn btn-primary" disabled={!valid || busy}>{busy ? <><span className="spinner" />Saqlanmoqda...</> : 'Saqlash'}</button></>}>
    <div className="banner-editor">
      <div className="form-stack">
        <Field label="Sarlavha"><input className="input" value={b.title} maxLength={80} required minLength={2} onChange={e => setB({ ...b, title: e.target.value })} placeholder="Masalan: Yangi soatlar keldi" /></Field>
        <Field label="Qisqa tavsif" hint="Ixtiyoriy, 160 belgigacha"><textarea className="input" rows={2} value={b.subtitle} maxLength={160} onChange={e => setB({ ...b, subtitle: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label="Tugma havolasi"><select className="input" value={kind} onChange={e => setTarget(e.target.value, e.target.value === 'category' ? categories[0]?.slug || '' : '')}>{targetNames.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></Field>
          {kind === 'category' && <Field label="Kategoriya"><select className="input" value={ref} onChange={e => setTarget('category', e.target.value)}>{categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></Field>}
          {kind === 'product' && <Field label="Mahsulot slug" hint="Mahsulot havolasidagi nom, masalan: qora-soat"><input className="input" value={ref} onChange={e => setTarget('product', e.target.value.toLowerCase())} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></Field>}
          {kind !== 'none' && <Field label="Tugma matni"><input className="input" value={b.ctaLabel} maxLength={24} onChange={e => setB({ ...b, ctaLabel: e.target.value })} /></Field>}
          <Field label="Rang"><select className="input" value={b.tone} onChange={e => setB({ ...b, tone: e.target.value as Banner['tone'] })}><option value="accent">Sariq</option><option value="dark">Qora</option><option value="light">Oq</option></select></Field>
          <Field label="Tartib raqami" hint="Kichigi oldinda"><NumberInput value={b.position ?? 0} max={999} onChange={position => setB(old => ({ ...old, position }))} aria-label="Tartib raqami" /></Field>
        </div>
        <Toggle label="Faol" hint="Mijoz bosh sahifasida koʻrinadi" checked={b.active ?? true} onChange={v => setB({ ...b, active: v })} />
        <div className="form-stack"><span className="field-label">Rasm (ixtiyoriy)</span><span className="t-caption">Tavsiya: 1200×800 yoki kvadrat, asosiy obyekt markazda. Rasm matn ustiga tushmaydi — alohida ustunda koʻrsatiladi.</span>
          {b.imageUrl ? <div className="picker-preview"><img src={b.imageUrl} alt="Banner rasmi" /><div className="picker-side"><button type="button" className="btn btn-sm btn-quiet" onClick={() => setB({ ...b, imageUrl: '' })}><Icon name="trash" size={16} />Rasmni olib tashlash</button></div></div>
            : <ImagePicker disabled={busy} upload={async (blob, progress) => { const r = await upload('/admin/images', blob, progress); setB(old => ({ ...old, imageUrl: r.url })); }} />}
        </div>
      </div>
      <div className="banner-preview-col"><span className="t-caption">Telefonda koʻrinishi (360 px)</span><div className="phone-frame"><BannerCard banner={{ ...b, title: b.title || 'Sarlavha' }} /></div><div className="phone-frame on-dark"><BannerCard dark banner={{ ...b, title: b.title || 'Sarlavha' }} /></div></div>
    </div>
  </Modal>;
}

// ---------------------------------------------------------------- Order payment
type Txn = { id: number; provider: string; providerTxnId: string; amount: number; state: string; createdMs: number; performedMs: number | null; cancelledMs: number | null; cancelReason: number | null };
export type PaymentRow = { id: number; amount: number; method: string; reference: string; note: string; createdAt: string; recordedByName?: string; recordedByEmail?: string };
type PayOrder = { id: number; total: number; status: string; paymentMethod?: string; paymentStatus?: string; paidAt?: string | null; paymentNote?: string };
const txnStates: Record<string, string> = { created: 'Kutilmoqda', performed: 'Bajarildi', cancelled: 'Bekor qilindi', refunded: 'Qaytarildi' };
export function OrderPayment({ order, payments, transactions, role, request, onChanged }: { order: PayOrder; payments: PaymentRow[]; transactions: Txn[]; role: string; request: Request; onChanged: () => void }) {
  const paid = payments.reduce((s, x) => s + x.amount, 0) + transactions.filter(t => t.state === 'performed').reduce((s, t) => s + t.amount, 0);
  const status = order.paymentStatus || 'pending', method = order.paymentMethod || 'cash';
  const [form, setForm] = useState({ amount: Math.max(0, order.total - paid), method: method === 'bank_transfer' || method === 'card_terminal' ? method : 'cash', reference: '', note: '' });
  const [reason, setReason] = useState(''); const [mode, setMode] = useState<'' | 'failed' | 'refund'>('');
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<Result>(null);
  useEffect(() => { setForm(f => ({ ...f, amount: Math.max(0, order.total - paid) })); }, [order.id, paid]);
  const run = async (task: () => Promise<unknown>, text: string) => { setBusy(true); setResult(null); try { await task(); setResult({ ok: true, text }); setMode(''); setReason(''); onChanged(); } catch (e) { setResult({ ok: false, text: friendlyError(e) }); } finally { setBusy(false); } };
  const setStatus = (to: string, note = '') => run(() => request(`/admin/orders/${order.id}/payment`, { method: 'PATCH', body: JSON.stringify({ from: status, status: to, note }) }), 'Toʻlov holati yangilandi');
  const open = ['pending', 'verifying', 'failed'].includes(status) && order.status !== 'cancelled';
  const online = transactions.some(t => t.state === 'performed');
  return <section className="od-block"><h4>Toʻlov</h4>
    <Notice result={result} />
    <div className="pay-head"><span className="pay-method"><Icon name={method === 'bank_transfer' ? 'bank' : method === 'card_terminal' ? 'card' : method === 'cash' ? 'cash' : 'wallet'} size={18} />{paymentMethodNames[method] || method}</span><span className={`badge badge-${paymentStatusBadge[status] || 'new'}`}>{paymentStatusNames[status] || status}</span></div>
    <div className="pay-summary"><div><span className="t-caption">Toʻlangan</span><strong className="num">{money(paid)}</strong></div><div><span className="t-caption">Qolgan</span><strong className="num">{money(Math.max(0, order.total - paid))}</strong></div>{order.paidAt && <div><span className="t-caption">Toʻlov sanasi</span><strong>{formatDateTime(order.paidAt)}</strong></div>}</div>
    {order.paymentNote && <p className="t-caption">{status === 'failed' ? 'Xato sababi' : 'Izoh'}: {order.paymentNote}</p>}
    {transactions.length > 0 && <div className="table-wrap flush"><table className="table compact"><thead><tr><th>Provayder</th><th>Tranzaksiya ID</th><th className="r">Summa</th><th>Holat</th><th>Vaqt</th></tr></thead><tbody>
      {transactions.map(t => <tr key={t.id}><td>{paymentMethodNames[t.provider] || t.provider}</td><td className="num break">{t.providerTxnId}</td><td className="r num">{money(t.amount)}</td><td>{txnStates[t.state] || t.state}{t.cancelReason != null && t.state !== 'performed' ? ` (${t.cancelReason})` : ''}</td><td className="nowrap t-muted">{formatDateTime(new Date(t.performedMs || t.cancelledMs || t.createdMs).toISOString())}</td></tr>)}
    </tbody></table></div>}
    {payments.length > 0 && <ul className="line-items">{payments.map(p => <li key={p.id}><span className="li-name">{paymentMethodNames[p.method] || p.method}{p.reference && <span className="t-caption num"> · {p.reference}</span>}<span className="t-caption"> · {formatDateTime(p.createdAt)}{p.recordedByName || p.recordedByEmail ? ` · ${p.recordedByName || p.recordedByEmail}` : ''}</span></span><span className="num">{money(p.amount)}</span></li>)}</ul>}
    {open && <form className="pay-form" onSubmit={e => { e.preventDefault(); void run(() => request(`/admin/orders/${order.id}/payments`, { method: 'POST', body: JSON.stringify(form) }), 'Toʻlov qayd etildi'); }}>
      <Field label="Qabul qilingan summa"><NumberInput value={form.amount} onChange={amount => setForm(f => ({ ...f, amount }))} suffix="soʻm" aria-label="Qabul qilingan summa" /></Field>
      <Field label="Usul"><select className="input" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}><option value="cash">Naqd</option><option value="bank_transfer">Bank oʻtkazmasi</option><option value="card_terminal">Terminal</option></select></Field>
      <Field label="Tranzaksiya / chek raqami" hint={form.method === 'cash' ? 'Ixtiyoriy' : 'Takroriy qayd etilmaydi'}><input className="input" value={form.reference} maxLength={120} onChange={e => setForm({ ...form, reference: e.target.value })} /></Field>
      <button className="btn btn-secondary" disabled={busy || form.amount <= 0}><Icon name="wallet" size={18} />Toʻlovni qayd etish</button>
    </form>}
    {open && <div className="status-actions">
      {status !== 'verifying' && <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => setStatus('verifying')}>Tekshirilmoqda deb belgilash</button>}
      {status !== 'pending' && <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => setStatus('pending')}>Kutilmoqda</button>}
      {status !== 'failed' && <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => setMode('failed')}>Muvaffaqiyatsiz</button>}
    </div>}
    {role === 'owner' && status === 'paid' && !online && <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => setMode('refund')}><Icon name="history" size={16} />Pul qaytarildi deb belgilash</button>}
    {status === 'paid' && online && <p className="t-caption">Onlayn toʻlov: qaytarish {paymentMethodNames[transactions.find(t => t.state === 'performed')!.provider]} kabinetida bajariladi, holat avtomatik yangilanadi.</p>}
    {mode && <div className="resolve-box">
      <Field label={mode === 'failed' ? 'Sabab (mijozga koʻrinadi)' : 'Qaytarish sababi'} hint="Audit jurnaliga yoziladi"><textarea className="input" rows={2} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} /></Field>
      <div className="form-actions"><button type="button" className="btn btn-quiet" onClick={() => { setMode(''); setReason(''); }}>Bekor qilish</button><button type="button" className="btn btn-danger" disabled={busy || reason.trim().length < (mode === 'failed' ? 3 : 5)} onClick={() => mode === 'failed' ? setStatus('failed', reason.trim()) : run(() => request(`/admin/orders/${order.id}/refund`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) }), 'Qaytarish qayd etildi')}>Tasdiqlash</button></div>
    </div>}
    {order.status === 'cancelled' && <p className="t-caption">Bekor qilingan buyurtmaga toʻlov yozilmaydi.</p>}
  </section>;
}
