// Interactive maps for the WebView/desktop apps.
//  • Default: MapLibre GL + OpenFreeMap vector tiles — free, no API key, no billing (© OpenStreetMap contributors).
//  • Optional: Google Maps JavaScript API when the owner enters a restricted browser key (adds reverse geocoding).
//  • If neither can draw (no WebGL, offline, provider error) the component degrades to an honest, clearly labelled
//    list of coordinates with links — no fake map is ever drawn.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

declare global { interface Window { google?: any; __fayzMapsReady?: () => void } }
export type LatLng = { lat: number; lng: number };
export type MapMarker = LatLng & { kind: 'destination' | 'courier' | 'store'; title: string };
export type MapProvider = 'google' | 'openfreemap';
/** Tashkent centre — only the initial view when nothing better is known. */
export const DEFAULT_CENTER: LatLng = { lat: 41.3111, lng: 69.2797 };
export const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

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

/** MapLibre is code-split: it is downloaded only when a map is actually shown. */
let maplibre: Promise<any> | null = null;
function loadMapLibre(): Promise<any> {
  if (!maplibre) maplibre = Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]).then(([m]) => { const ml = (m as any).default ?? m; ml.setWorkerUrl(mapWorkerUrl); return ml; }).catch(e => { maplibre = null; throw e; });
  return maplibre;
}
export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export const mapsLink = (p: LatLng) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
export const directionsLink = (to: LatLng, from?: LatLng | null) => `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from.lat},${from.lng}` : ''}&destination=${to.lat},${to.lng}&travelmode=driving`;
export const formatCoords = (p: LatLng) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;

const colors = { destination: '#E5484D', courier: '#2F6FEB', store: '#1E1E1E' };

/** Common surface both providers implement, so markers/fit/picker logic is written once. */
type Engine = { setMarkers(m: MapMarker[], fit: boolean, picker: boolean): void; panTo(p: LatLng): void; destroy(): void };

async function googleEngine(el: HTMLElement, key: string, center: LatLng | null | undefined, picker: boolean, onIdle: (p: LatLng) => void, onAddress?: (a: string) => void): Promise<Engine> {
  const google = await loadGoogleMaps(key);
  const map = new google.maps.Map(el, { center: center || DEFAULT_CENTER, zoom: center ? 16 : 12, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false });
  let drawn: any[] = []; let timer: number | undefined;
  if (picker) map.addListener('idle', () => {
    const c = map.getCenter(); const p = { lat: c.lat(), lng: c.lng() }; onIdle(p);
    if (onAddress) { window.clearTimeout(timer); timer = window.setTimeout(() => new google.maps.Geocoder().geocode({ location: p }).then((r: any) => onAddress(r.results?.[0]?.formatted_address || '')).catch(() => onAddress('')), 700); }
  });
  return {
    setMarkers(markers, fit) {
      drawn.forEach(m => m.setMap(null));
      drawn = markers.map(m => new google.maps.Marker({ map, position: m, title: m.title, icon: { path: google.maps.SymbolPath.CIRCLE, scale: m.kind === 'courier' ? 9 : 8, fillColor: colors[m.kind], fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }));
      if (fit && markers.length > 1) { const b = new google.maps.LatLngBounds(); markers.forEach(m => b.extend(m)); map.fitBounds(b, 56); }
      else if (!picker && markers[0]) map.setCenter(markers[0]);
    },
    panTo: p => map.panTo(p),
    destroy: () => { window.clearTimeout(timer); drawn.forEach(m => m.setMap(null)); },
  };
}

async function openFreeMapEngine(el: HTMLElement, center: LatLng | null | undefined, picker: boolean, onIdle: (p: LatLng) => void): Promise<Engine> {
  if (!webglAvailable()) throw new Error('Bu qurilmada WebGL yoʻq — xarita chizilmaydi');
  const ml = await loadMapLibre();
  const start = center || DEFAULT_CENTER;
  const map = new ml.Map({ container: el, style: OPENFREEMAP_STYLE, center: [start.lng, start.lat], zoom: center ? 16 : 12, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false, cooperativeGestures: false, fadeDuration: 0 });
  map.touchZoomRotate.disableRotation();
  map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Xarita serveri javob bermadi')), 20000);
    map.once('load', () => { window.clearTimeout(timeout); resolve(); });
    map.on('error', (e: any) => { if (!map.loaded() && !map.isStyleLoaded()) { window.clearTimeout(timeout); reject(new Error(e?.error?.message || 'Xarita yuklanmadi')); } });
  }).catch(e => { map.remove(); throw e; });
  // Prefer Uzbek, then Latin-script names; OSM local names are often Russian/Cyrillic in Tashkent.
  for (const layer of map.getStyle().layers || []) {
    if (layer.type !== 'symbol') continue;
    const field = map.getLayoutProperty(layer.id, 'text-field');
    if (field && JSON.stringify(field).includes('"name')) map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:uz'], ['get', 'name:latin'], ['get', 'name']]);
  }
  if (picker) map.on('moveend', () => { const c = map.getCenter(); onIdle({ lat: c.lat, lng: c.lng }); });
  let drawn: any[] = [];
  return {
    setMarkers(markers, fit) {
      drawn.forEach(m => m.remove());
      drawn = markers.map(m => {
        const dot = document.createElement('div');
        dot.className = `map-dot map-dot-${m.kind}`; dot.title = m.title; dot.setAttribute('aria-label', m.title); dot.style.background = colors[m.kind];
        return new ml.Marker({ element: dot }).setLngLat([m.lng, m.lat]).addTo(map);
      });
      if (fit && markers.length > 1) { const b = new ml.LngLatBounds(); markers.forEach(m => b.extend([m.lng, m.lat])); map.fitBounds(b, { padding: 56, maxZoom: 16, duration: 0 }); }
      else if (!picker && markers[0]) map.jumpTo({ center: [markers[0].lng, markers[0].lat], zoom: Math.max(map.getZoom(), 15) });
    },
    panTo: p => map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 16), duration: 400 }),
    destroy: () => map.remove(),
  };
}

/**
 * Map with markers. In picker mode the map moves under a fixed centre pin and `onPick` receives the centre
 * after each pan; `onAddress` receives a reverse-geocoded address only on Google (OpenFreeMap has no geocoder).
 */
export function MapView({ apiKey, center, markers = [], picker, onPick, onAddress, fit, className = '' }: { apiKey?: string; center?: LatLng | null; markers?: MapMarker[]; picker?: boolean; onPick?: (p: LatLng) => void; onAddress?: (address: string) => void; fit?: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const callbacks = useRef({ onPick, onAddress }); callbacks.current = { onPick, onAddress };
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [provider, setProvider] = useState<MapProvider>(apiKey ? 'google' : 'openfreemap');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false; setState('loading'); setError('');
    const el = box.current; if (!el) return;
    const idle = (p: LatLng) => callbacks.current.onPick?.(p);
    const start = async () => {
      if (apiKey) {
        try { const e = await googleEngine(el, apiKey, center, !!picker, idle, a => callbacks.current.onAddress?.(a)); if (!cancelled) setProvider('google'); return e; }
        catch { el.replaceChildren(); /* a broken/restricted key falls back to the free map */ }
      }
      const e = await openFreeMapEngine(el, center, !!picker, idle); if (!cancelled) setProvider('openfreemap'); return e;
    };
    start().then(e => { if (cancelled) { e.destroy(); return; } engine.current = e; setState('ready'); })
      .catch(e => { if (!cancelled) { setState('failed'); setError(e?.message || 'Xarita yuklanmadi'); } });
    return () => { cancelled = true; engine.current?.destroy(); engine.current = null; };
  }, [apiKey]);

  useEffect(() => { if (state === 'ready' && center && picker) engine.current?.panTo(center); }, [state, center?.lat, center?.lng]);
  useEffect(() => { if (state === 'ready') engine.current?.setMarkers(markers, !!fit, !!picker); }, [state, JSON.stringify(markers)]);

  if (state === 'failed') {
    // Every known point is listed with its own link, so courier and destination stay usable without a map.
    const points: { title: string; p: LatLng }[] = markers.length ? markers.map(m => ({ title: m.title, p: m })) : center ? [{ title: 'Tanlangan nuqta', p: center }] : [];
    return <div className={`map-fallback ${className}`} role="note">
      <Icon name="map" size={26} stroke={1.6} />
      <strong>Xarita yuklanmadi</strong>
      <span className="t-caption">{error}. Internet aloqasini tekshiring — manzil koordinatalari pastda.</span>
      {points.length === 1 && <><span className="num map-coords">{formatCoords(points[0].p)}</span><a className="btn btn-sm btn-secondary" href={mapsLink(points[0].p)} target="_blank" rel="noopener"><Icon name="navigation" size={16} />Google Maps’da ochish</a></>}
      {points.length > 1 && <ul className="map-points">{points.map((x, i) => <li key={i}><span>{x.title}</span><a className="num" href={mapsLink(x.p)} target="_blank" rel="noopener">{formatCoords(x.p)}</a></li>)}</ul>}
    </div>;
  }
  return <div className={`map-box ${className}`} data-provider={state === 'ready' ? provider : undefined}>
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
