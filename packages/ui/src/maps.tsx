// Google Maps (Maps JavaScript API) for the WebView/desktop apps. The browser key is public by design and
// must be restricted in Google Cloud to the app origin. Without a key the components degrade to an honest,
// clearly labelled fallback (coordinates + a link that opens Google Maps) — no fake map is drawn.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

declare global { interface Window { google?: any; __fayzMapsReady?: () => void } }
export type LatLng = { lat: number; lng: number };
export type MapMarker = LatLng & { kind: 'destination' | 'courier' | 'store'; title: string };
/** Tashkent centre — only the initial view when nothing better is known. */
export const DEFAULT_CENTER: LatLng = { lat: 41.3111, lng: 69.2797 };

let loading: Promise<any> | null = null;
export function loadGoogleMaps(key: string): Promise<any> {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    window.__fayzMapsReady = () => resolve(window.google);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=uz&region=UZ&callback=__fayzMapsReady`;
    script.async = true;
    script.onerror = () => { loading = null; reject(new Error('Google Maps yuklanmadi')); };
    document.head.appendChild(script);
    setTimeout(() => { if (!window.google?.maps) { loading = null; reject(new Error('Google Maps javob bermadi')); } }, 15000);
  });
  return loading;
}

export const mapsLink = (p: LatLng) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
export const directionsLink = (to: LatLng, from?: LatLng | null) => `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from.lat},${from.lng}` : ''}&destination=${to.lat},${to.lng}&travelmode=driving`;
export const formatCoords = (p: LatLng) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;

const colors = { destination: '#E5484D', courier: '#2F6FEB', store: '#1E1E1E' };

/**
 * Map with markers. In picker mode the map moves under a fixed centre pin and `onPick` receives the centre
 * after each pan; `onAddress` receives a reverse-geocoded address when the Geocoding API allows it.
 */
export function MapView({ apiKey, center, markers = [], picker, onPick, onAddress, fit, className = '' }: { apiKey?: string; center?: LatLng | null; markers?: MapMarker[]; picker?: boolean; onPick?: (p: LatLng) => void; onAddress?: (address: string) => void; fit?: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null); const drawn = useRef<any[]>([]); const geocodeTimer = useRef<number | undefined>(undefined);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'off'>(apiKey ? 'loading' : 'off');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!apiKey) { setState('off'); return; }
    let cancelled = false;
    loadGoogleMaps(apiKey).then(google => {
      if (cancelled || !box.current) return;
      map.current = new google.maps.Map(box.current, { center: center || DEFAULT_CENTER, zoom: center ? 16 : 12, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false });
      if (picker) map.current.addListener('idle', () => {
        const c = map.current.getCenter(); const p = { lat: c.lat(), lng: c.lng() };
        onPick?.(p);
        if (onAddress) { window.clearTimeout(geocodeTimer.current); geocodeTimer.current = window.setTimeout(() => new google.maps.Geocoder().geocode({ location: p }).then((r: any) => onAddress(r.results?.[0]?.formatted_address || '')).catch(() => onAddress('')), 700); }
      });
      setState('ready');
    }).catch(e => { if (!cancelled) { setState('failed'); setError(e.message); } });
    return () => { cancelled = true; window.clearTimeout(geocodeTimer.current); };
  }, [apiKey]);

  useEffect(() => { if (state === 'ready' && center && picker) map.current.panTo(center); }, [state, center?.lat, center?.lng]);

  useEffect(() => {
    if (state !== 'ready') return;
    const google = window.google;
    drawn.current.forEach(m => m.setMap(null));
    drawn.current = markers.map(m => new google.maps.Marker({ map: map.current, position: m, title: m.title, icon: { path: google.maps.SymbolPath.CIRCLE, scale: m.kind === 'courier' ? 9 : 8, fillColor: colors[m.kind], fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }));
    if (fit && markers.length > 1) { const bounds = new google.maps.LatLngBounds(); markers.forEach(m => bounds.extend(m)); map.current.fitBounds(bounds, 56); }
    else if (!picker && markers[0]) map.current.setCenter(markers[0]);
  }, [state, JSON.stringify(markers)]);

  if (state === 'off' || state === 'failed') {
    // Every known point is listed with its own link, so courier and destination stay usable without a key.
    const points: { title: string; p: LatLng }[] = markers.length ? markers.map(m => ({ title: m.title, p: m })) : center ? [{ title: 'Tanlangan nuqta', p: center }] : [];
    return <div className={`map-fallback ${className}`} role="note">
      <Icon name="map" size={26} stroke={1.6} />
      <strong>{state === 'off' ? 'Xarita hali ulanmagan' : 'Xarita yuklanmadi'}</strong>
      <span className="t-caption">{state === 'off' ? 'Google Maps kaliti administrator tomonidan kiritilgach, bu yerda interaktiv xarita chiqadi.' : error}</span>
      {points.length === 1 && <><span className="num map-coords">{formatCoords(points[0].p)}</span><a className="btn btn-sm btn-secondary" href={mapsLink(points[0].p)} target="_blank" rel="noopener"><Icon name="navigation" size={16} />Google Maps’da ochish</a></>}
      {points.length > 1 && <ul className="map-points">{points.map((x, i) => <li key={i}><span>{x.title}</span><a className="num" href={mapsLink(x.p)} target="_blank" rel="noopener">{formatCoords(x.p)}</a></li>)}</ul>}
    </div>;
  }
  return <div className={`map-box ${className}`}>
    <div ref={box} className="map-canvas" aria-label="Xarita" role="application" />
    {state === 'loading' && <div className="map-loading"><span className="spinner" />Xarita yuklanmoqda...</div>}
    {picker && <div className="map-pin" aria-hidden="true"><svg width="40" height="52" viewBox="0 0 40 52"><path d="M20 51s17-17.5 17-30A17 17 0 0 0 3 21c0 12.5 17 30 17 30z" fill="#E5484D" stroke="#fff" strokeWidth="3" /><circle cx="20" cy="21" r="6" fill="#fff" /></svg></div>}
  </div>;
}

/** One-shot device location through the WebView/browser geolocation permission. */
export function currentPosition(timeout = 15000): Promise<LatLng & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Bu qurilmada joylashuvni aniqlab boʻlmaydi')); return; }
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }), e => reject(new Error(e.code === 1 ? 'Joylashuvga ruxsat berilmadi. Pinni xaritada qoʻlda belgilang.' : e.code === 3 ? 'Joylashuv aniqlanmadi (vaqt tugadi). Qayta urinib koʻring.' : 'Joylashuv aniqlanmadi. GPS yoqilganini tekshiring.')), { enableHighAccuracy: true, timeout, maximumAge: 30000 });
  });
}
