// One address picker for the home screen ("Sizning joylashuvingiz"), the profile and checkout:
// GPS, a map pin, a written address, entrance/floor/landmark details, and addresses saved on this phone.
// A GPS point is never used as a delivery point by itself: the customer confirms it, and a fix that is too
// inaccurate must be corrected on the map first.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../../packages/ui/src/Icon';
import { friendlyError } from '../../../packages/ui/src/format';
import { MapView, currentPosition, distanceMeters, formatCoords, type LatLng } from '../../../packages/ui/src/maps';
import { Field, Sheet, revealOnFocus } from './components';

export type SavedAddress = { id: string; text: string; details: string; lat?: number; lng?: number; accuracy?: number; source: 'gps' | 'map' | 'text'; at: number };
type Store = { list: SavedAddress[]; currentId: string | null };
const KEY = 'fayz_addresses_v1';
/** GPS fixes worse than this (metres) must be corrected on the map before they can be confirmed. */
export const MAX_GPS_ERROR = 150;
const MAX_SAVED = 6;

const load = (): Store => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Store | null; if (s && Array.isArray(s.list)) return s; } catch { /* corrupt */ } return { list: [], currentId: null }; };
const sameSpot = (a: SavedAddress, b: SavedAddress) => a.text.trim().toLowerCase() === b.text.trim().toLowerCase() && (a.lat == null || b.lat == null || distanceMeters(a as LatLng, b as LatLng) < 25);
export const hasPoint = (a: SavedAddress | null | undefined): a is SavedAddress & LatLng => !!a && a.lat != null && a.lng != null;

/** Addresses kept only on this phone; `current` is the one checkout and the home screen use. */
export function useAddresses(legacyText = '') {
  const [store, setStore] = useState<Store>(() => {
    const s = load();
    // First run after the update: the address the customer typed earlier becomes a saved (text-only) address.
    if (!s.list.length && legacyText.trim().length >= 5) { const a: SavedAddress = { id: 'a' + Date.now().toString(36), text: legacyText.trim(), details: '', source: 'text', at: Date.now() }; return { list: [a], currentId: a.id }; }
    return s;
  });
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage full */ } }, [store]);
  const save = useCallback((address: SavedAddress) => setStore(old => {
    const rest = old.list.filter(a => a.id !== address.id && !sameSpot(a, address));
    return { list: [address, ...rest].slice(0, MAX_SAVED), currentId: address.id };
  }), []);
  const remove = useCallback((id: string) => setStore(old => { const list = old.list.filter(a => a.id !== id); return { list, currentId: old.currentId === id ? list[0]?.id ?? null : old.currentId }; }), []);
  const current = store.list.find(a => a.id === store.currentId) ?? null;
  return { list: store.list, current, save, remove };
}

/** What to call an address on screen: its written form, or the map point when only a point was confirmed. */
export function addressTitle(a: SavedAddress) { return a.text || (hasPoint(a) ? `Xaritada belgilangan nuqta · ${formatCoords(a)}` : 'Manzil'); }
export function addressLine(a: SavedAddress) { return a.details ? `${addressTitle(a)} (${a.details})` : addressTitle(a); }

/**
 * The picker sheet. `autoLocate` starts GPS on open (the customer tapped "Joylashuvimni aniqlash").
 * If permission is refused, the map and the written address still work.
 */
export function AddressSheet({ apiKey, title = 'Manzil', saved, initial, autoLocate, onConfirm, onRemove, onClose, requireText = false }: { apiKey?: string; title?: string; saved: SavedAddress[]; initial: SavedAddress | null; autoLocate?: boolean; onConfirm: (a: SavedAddress) => void; onRemove?: (id: string) => void; onClose: () => void; requireText?: boolean }) {
  const [center, setCenter] = useState<LatLng | null>(hasPoint(initial) ? { lat: initial.lat, lng: initial.lng } : null);
  const [point, setPoint] = useState<(LatLng & { accuracy?: number }) | null>(hasPoint(initial) ? { lat: initial.lat, lng: initial.lng, accuracy: initial.accuracy } : null);
  const [source, setSource] = useState<SavedAddress['source']>(initial?.source ?? 'map');
  const [text, setText] = useState(initial?.text || ''); const [details, setDetails] = useState(initial?.details || '');
  const typed = useRef(!!initial?.text); // a written address is never overwritten by the map's guess
  const gpsFix = useRef<(LatLng & { accuracy: number }) | null>(source === 'gps' && hasPoint(initial) ? { lat: initial.lat, lng: initial.lng, accuracy: initial.accuracy ?? 0 } : null);
  const [locating, setLocating] = useState(false); const [error, setError] = useState('');
  const locate = useCallback(async () => {
    setLocating(true); setError('');
    try {
      // A second tap must not return the same cached (possibly inaccurate) reading.
      const p = await currentPosition(20000, gpsFix.current ? 0 : 30000);
      gpsFix.current = p; setCenter({ lat: p.lat, lng: p.lng }); setPoint(p); setSource('gps');
    } catch (e) { setError(`${friendlyError(e)} Xaritani surib nuqtani tanlang yoki manzilni yozing.`); }
    finally { setLocating(false); }
  }, []);
  useEffect(() => { if (autoLocate) void locate(); }, []);
  // The map reports its centre whenever it stops moving. Moving it away from the GPS fix makes it a map pick.
  const onPick = useCallback((p: LatLng) => {
    const fix = gpsFix.current;
    if (fix && distanceMeters(fix, p) < 3) { setPoint(fix); setSource('gps'); return; }
    setPoint({ lat: p.lat, lng: p.lng }); setSource('map');
  }, []);
  const onAddress = useCallback((guess: string) => { if (guess && !typed.current) setText(guess); }, []);
  const lowAccuracy = source === 'gps' && (point?.accuracy ?? 0) > MAX_GPS_ERROR;
  const textOk = !requireText || text.trim().length >= 5;
  const canConfirm = textOk && !lowAccuracy && (point != null || text.trim().length >= 5);
  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({ id: initial?.id && sameSpot(initial, { ...initial, text, lat: point?.lat, lng: point?.lng }) ? initial.id : 'a' + Date.now().toString(36), text: text.trim(), details: details.trim(), ...(point ? { lat: point.lat, lng: point.lng, ...(source === 'gps' && point.accuracy ? { accuracy: point.accuracy } : {}) } : {}), source: point ? source : 'text', at: Date.now() });
  };
  const others = saved.filter(a => a.id !== initial?.id);
  return <Sheet title={title} onClose={onClose} footer={<>
    <button className="btn btn-primary btn-lg btn-block" disabled={!canConfirm} onClick={confirm}><Icon name="check" size={20} />Shu joyni tasdiqlash</button>
    {!canConfirm && <p className="t-caption sheet-why">{lowAccuracy ? `GPS aniqligi past (±${point?.accuracy} m). Xaritani surib, pinni aniq joyga qoʻying.` : 'Xaritada nuqtani belgilang yoki manzilni yozing (koʻcha, uy).'}</p>}
    <button className="btn btn-quiet btn-block" onClick={onClose}>Bekor qilish</button>
  </>}>
    <div className="form-stack address-sheet">
      {others.length > 0 && <section className="saved-addresses" aria-label="Saqlangan manzillar">
        <h3 className="t-label">Saqlangan manzillar</h3>
        <ul>{others.map(a => <li key={a.id}>
          <button type="button" className="saved-address" onClick={() => onConfirm({ ...a, at: Date.now() })}><Icon name={hasPoint(a) ? 'pin' : 'home'} size={18} /><span><b>{addressTitle(a)}</b>{a.details && <small>{a.details}</small>}</span></button>
          {onRemove && <button type="button" className="icon-btn" onClick={() => onRemove(a.id)} aria-label={`${addressTitle(a)} manzilini oʻchirish`}><Icon name="trash" size={17} /></button>}
        </li>)}</ul>
      </section>}
      <button type="button" className="btn btn-secondary btn-block" onClick={locate} disabled={locating}>{locating ? <><span className="spinner" />Aniqlanmoqda...</> : <><Icon name="target" size={18} />Joylashuvimni aniqlash (GPS)</>}</button>
      {error && <div className="banner banner-warning" role="alert"><Icon name="alert" size={20} /><div>{error}</div></div>}
      <p className="t-caption">Xaritani suring — pin yetkazish nuqtasini koʻrsatadi.</p>
      <MapView apiKey={apiKey} center={center} picker onPick={onPick} onAddress={onAddress} className="tall" />
      {point && <div className={`loc-summary${lowAccuracy ? ' warn' : ''}`}><Icon name={lowAccuracy ? 'alert' : 'pin'} size={20} /><div><strong>{source === 'gps' ? 'Joriy joylashuv (GPS)' : 'Xaritada belgilangan nuqta'}</strong><span className="t-caption num">{formatCoords(point)}{source === 'gps' && point.accuracy ? ` · ±${point.accuracy} m` : ''}</span></div></div>}
      <Field label="Manzil" hint="Koʻcha, uy raqami — kuryer va doʻkon shu matnni koʻradi"><textarea className="input" rows={2} value={text} maxLength={300} onChange={e => { typed.current = true; setText(e.target.value); }} onFocus={revealOnFocus} placeholder="Masalan: Chilonzor 9-kvartal, 12-uy" /></Field>
      <Field label="Podyezd, qavat, moʻljal" hint="Ixtiyoriy"><input className="input" value={details} maxLength={200} onChange={e => setDetails(e.target.value)} onFocus={revealOnFocus} placeholder="Masalan: 3-podyezd, 5-qavat, doʻkon yonida" /></Field>
    </div>
  </Sheet>;
}
