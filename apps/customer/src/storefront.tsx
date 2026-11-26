// Customer storefront pieces: storefront config (cached for offline start), the customer's own location (one-shot,
// stored only on this phone), the home location strip and the full-screen "route to the store" map.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../../packages/ui/src/Icon';
import { friendlyError } from '../../../packages/ui/src/format';
import { MapView, currentPosition, directionsLink, distanceMeters, formatDistance, formatDuration, type LatLng, type MapMarker, type RouteLine } from '../../../packages/ui/src/maps';
import { openExternal } from '../../../packages/ui/src/native';
import { storefrontFromSettings, type Storefront } from '../../../packages/ui/src/storefront';

type Api = <T>(path: string, init?: RequestInit) => Promise<T>;
const STOREFRONT_KEY = 'fayz_storefront_v1';
const USER_LOCATION_KEY = 'fayz_user_location_v1';
const read = <T,>(key: string): T | null => { try { return JSON.parse(localStorage.getItem(key) || 'null') as T | null; } catch { return null; } };

/** GET /storefront (or GET /settings on an older server), cached so the home screen renders offline. */
export function useStorefront(api: Api) {
  const [storefront, setStorefront] = useState<Storefront | null>(() => read<Storefront>(STOREFRONT_KEY));
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return; busy.current = true;
    const keep = (value: Storefront) => { setStorefront(value); try { localStorage.setItem(STOREFRONT_KEY, JSON.stringify(value)); } catch { /* storage full */ } };
    try { keep(await api<Storefront>('/storefront')); }
    catch { try { keep(storefrontFromSettings((await api<{ settings: Record<string, string> }>('/settings')).settings)); } catch { /* offline: keep the cached copy */ } }
    finally { busy.current = false; }
  }, [api]);
  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);
  return { storefront, refresh };
}

export type UserLocation = LatLng & { accuracy?: number; address?: string; source: 'gps' | 'manual'; at: number };
/** The customer's location — only when they ask for it, once, and kept only on this phone (no background tracking). */
export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(() => read<UserLocation>(USER_LOCATION_KEY));
  const save = useCallback((value: UserLocation | null) => {
    setLocation(value);
    if (value) localStorage.setItem(USER_LOCATION_KEY, JSON.stringify(value)); else localStorage.removeItem(USER_LOCATION_KEY);
  }, []);
  return [location, save] as const;
}
export async function detectLocation(): Promise<UserLocation> {
  const p = await currentPosition();
  return { lat: p.lat, lng: p.lng, accuracy: p.accuracy, source: 'gps', at: Date.now() };
}
const shortCoords = (p: LatLng) => `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;

/** Two compact rows under the search field: where the store is, and where the customer is. */
export function LocationStrip({ storefront, user, address, locating, onStore, onUser }: { storefront: Storefront | null; user: UserLocation | null; address?: string; locating: boolean; onStore: () => void; onUser: () => void }) {
  const store = storefront?.store;
  const distance = user && store?.lat != null && store.lng != null ? distanceMeters(user, { lat: store.lat, lng: store.lng }) : null;
  return <div className="loc-strip">
    <button type="button" className="loc-row" onClick={onStore}>
      <span className="loc-ic" aria-hidden="true"><Icon name="store" size={20} /></span>
      <span className="loc-text"><small>Doʻkon manzili</small><b>{store?.configured ? store.address || store.name : store ? 'Manzil hali kiritilmagan' : 'Yuklanmoqda...'}</b></span>
      <Icon name="chevron" size={18} />
    </button>
    <button type="button" className="loc-row" onClick={onUser} aria-busy={locating}>
      <span className="loc-ic loc-ic-user" aria-hidden="true">{locating ? <span className="spinner" /> : <Icon name="target" size={20} />}</span>
      <span className="loc-text"><small>Sizning joylashuvingiz</small><b className={address || user ? '' : 'loc-action'}>{locating ? 'Aniqlanmoqda...' : address || (user ? user.address || shortCoords(user) : 'Aniqlash')}</b></span>
      {distance != null && !locating ? <span className="loc-dist num" title="Toʻgʻri chiziq boʻyicha">~{formatDistance(distance)}</span> : <Icon name="chevron" size={18} />}
    </button>
  </div>;
}

type RouteResult = { coordinates: RouteLine; distanceMeters: number; durationSeconds: number; attribution: string; provider: string };
/**
 * Full-screen map: store pin, customer pin and — when a routing service is connected — the real road route with
 * distance and time. Closes with its back button, the Android Back key or Escape (history entry), keeping the
 * home screen (and its scroll position) mounted underneath.
 */
export function StoreScreen({ api, storefront, user, onUser, mapsKey, onClose }: { api: Api; storefront: Storefront | null; user: UserLocation | null; onUser: (l: UserLocation | null) => void; mapsKey?: string; onClose: () => void }) {
  const store = storefront?.store;
  const target = store?.lat != null && store.lng != null ? { lat: store.lat, lng: store.lng } : null;
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready' | 'unavailable' | 'error'>('idle');
  const [routeError, setRouteError] = useState('');
  const [locating, setLocating] = useState(false); const [locError, setLocError] = useState('');
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const back = () => history.back();
  useEffect(() => {
    history.pushState({ fayz: 'store-map' }, '');
    const onPop = () => closeRef.current();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') history.back(); };
    window.addEventListener('popstate', onPop); window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []);
  useEffect(() => {
    if (!target || !user) { setRoute(null); setRouteState('idle'); return; }
    if (!storefront?.routing.available) { setRoute(null); setRouteState('unavailable'); return; }
    let cancelled = false; setRouteState('loading'); setRouteError('');
    api<{ route: RouteResult }>('/store/route', { method: 'POST', body: JSON.stringify({ lat: user.lat, lng: user.lng }) })
      .then(r => { if (!cancelled) { setRoute(r.route); setRouteState('ready'); } })
      .catch(e => { if (cancelled) return; const message = friendlyError(e); setRoute(null); if (/ulanmagan/.test(message)) setRouteState('unavailable'); else { setRouteState('error'); setRouteError(message); } });
    return () => { cancelled = true; };
  }, [target?.lat, target?.lng, user?.lat, user?.lng, storefront?.routing.available]);
  const locate = async () => {
    setLocating(true); setLocError('');
    try { onUser(await detectLocation()); } catch (e) { setLocError(friendlyError(e)); } finally { setLocating(false); }
  };
  // The map opens with the route right away when the customer already allowed location (no new prompt).
  useEffect(() => {
    if (user || !target) return;
    navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then(s => { if (s.state === 'granted') void locate(); }).catch(() => undefined);
  }, []);
  const markers: MapMarker[] = [];
  if (target) markers.push({ ...target, kind: 'store', title: store!.name });
  if (user) markers.push({ lat: user.lat, lng: user.lng, kind: 'user', title: 'Siz' });
  const straight = target && user ? distanceMeters(user, target) : null;
  const android = !!(window as unknown as { FayzNative?: unknown }).FayzNative;
  return <div className="store-screen" role="dialog" aria-modal="true" aria-label="Doʻkonga yoʻl">
    <header className="store-top">
      <button type="button" className="icon-btn filled" onClick={back} aria-label="Orqaga"><Icon name="back" /></button>
      <div className="store-top-title"><strong>{store?.name || 'Fayz Market'}</strong><span>{store?.address || 'Doʻkon manzili'}</span></div>
    </header>
    {!target ? <div className="store-empty">
      <div className="empty-icon"><Icon name="store" size={30} stroke={1.6} /></div>
      <h2 className="t-h2">Doʻkon manzili hali kiritilmagan</h2>
      <p className="t-body t-muted">Administrator manzilni kiritgach, xarita va yoʻl shu yerda koʻrinadi.</p>
      {store?.phone && <a className="btn btn-secondary" href={`tel:${store.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={18} />Doʻkonga qoʻngʻiroq</a>}
    </div> : <>
      <div className="store-map"><MapView apiKey={mapsKey} markers={markers} route={route?.coordinates ?? null} fit={markers.length > 1} center={target} className="full" /></div>
      <section className="store-card" aria-live="polite">
        {routeState === 'ready' && route && <div className="route-stats">
          <div><span className="t-caption">Yoʻl boʻyicha masofa</span><strong className="num">{formatDistance(route.distanceMeters)}</strong></div>
          <div><span className="t-caption">Taxminan (avtomobilda)</span><strong className="num">{formatDuration(route.durationSeconds)}</strong></div>
        </div>}
        {routeState === 'loading' && <p className="t-caption route-note"><span className="spinner" />Marshrut hisoblanmoqda...</p>}
        {routeState === 'unavailable' && <div className="route-off"><Icon name="navigation" size={18} /><p className="t-caption">Ilova ichida yoʻl chizigʻi doʻkon marshrut xizmatini ulaganidan keyin koʻrinadi (Admin → Integratsiyalar → Marshrut).{straight != null && <> Hozircha toʻgʻri chiziq boʻyicha: <b className="num">~{formatDistance(straight)}</b>.</>} Aniq yoʻlni «Yoʻlga chiqish» tugmasi Google Maps’da ochadi.</p></div>}
        {routeState === 'error' && <div className="banner banner-warning" role="alert"><Icon name="alert" size={20} /><div>{routeError}. «Yoʻlga chiqish» baribir ishlaydi.</div></div>}
        {!user && !locating && <p className="t-caption route-note">Joylashuvingizni aniqlasangiz, yoʻl va masofa koʻrsatiladi. Ruxsat bermasangiz ham manzil va navigatsiya ishlaydi.</p>}
        {locError && <div className="banner banner-warning" role="alert"><Icon name="alert" size={20} /><div>{locError}</div></div>}
        <div className="store-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => openExternal(directionsLink(target, user))}><Icon name="navigation" size={20} />Yoʻlga chiqish</button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={locate} disabled={locating}>{locating ? <><span className="spinner" />Aniqlanmoqda...</> : <><Icon name="target" size={20} />{user ? 'Qayta aniqlash' : 'Joylashuvimni aniqlash'}</>}</button>
        </div>
        <div className="store-links">
          {android && <button type="button" className="link-btn" onClick={() => openExternal(`geo:${target.lat},${target.lng}?q=${target.lat},${target.lng}(${encodeURIComponent(store!.name)})`)}><Icon name="map" size={16} />Boshqa xarita ilovasida</button>}
          {store?.phone && <a className="link-btn" href={`tel:${store.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={16} />Qoʻngʻiroq</a>}
          {user && <button type="button" className="link-btn" onClick={() => onUser(null)}><Icon name="close" size={16} />Joylashuvni unutish</button>}
        </div>
        {route?.attribution && <p className="t-caption attribution">Marshrut: {route.attribution}</p>}
      </section>
    </>}
  </div>;
}
