// Interactive maps for the WebView/desktop apps.
//  • Default: MapLibre GL + OpenFreeMap vector tiles — free, no API key, no billing (© OpenStreetMap contributors).
//  • Optional: Google Maps JavaScript API when the owner enters a restricted browser key (adds reverse geocoding).
//  • If neither can draw (no WebGL, offline, provider error) the component degrades to an honest, clearly labelled
//    list of coordinates with links — no fake map is ever drawn.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { cachedBrand, isDarkTheme, markSource } from './brand';

declare global { interface Window { google?: any; __fayzMapsReady?: () => void } }
export type LatLng = { lat: number; lng: number };
export type MapMarker = LatLng & { kind: 'destination' | 'courier' | 'store' | 'user'; title: string };
/** Road geometry from the routing API, as [lng, lat] pairs. */
export type RouteLine = [number, number][];
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

const colors = { destination: '#E5484D', courier: '#2F6FEB', store: '#1E1E1E', user: '#2F6FEB' };
const ROUTE_COLOR = '#2F6FEB';
const storeIcon = () => markSource(cachedBrand(), isDarkTheme());
/** Straight-line distance in metres — only ever shown labelled as such, never drawn as a road. */
export function distanceMeters(a: LatLng, b: LatLng) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const formatDistance = (m: number) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
export const formatDuration = (s: number) => s < 3600 ? `${Math.max(1, Math.round(s / 60))} daqiqa` : `${Math.floor(s / 3600)} soat ${Math.round((s % 3600) / 60)} daqiqa`;

/** Common surface both providers implement, so markers/fit/picker logic is written once. */
type Engine = { setMarkers(m: MapMarker[], fit: boolean, picker: boolean, route: RouteLine | null): void; panTo(p: LatLng): void; destroy(): void };

async function googleEngine(el: HTMLElement, key: string, center: LatLng | null | undefined, picker: boolean, onIdle: (p: LatLng) => void, onAddress?: (a: string) => void): Promise<Engine> {
  const google = await loadGoogleMaps(key);
  const map = new google.maps.Map(el, { center: center || DEFAULT_CENTER, zoom: center ? 16 : 12, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false });
  let drawn: any[] = []; let timer: number | undefined; let line: any = null;
  if (picker) map.addListener('idle', () => {
    const c = map.getCenter(); const p = { lat: c.lat(), lng: c.lng() }; onIdle(p);
    if (onAddress) { window.clearTimeout(timer); timer = window.setTimeout(() => new google.maps.Geocoder().geocode({ location: p }).then((r: any) => onAddress(r.results?.[0]?.formatted_address || '')).catch(() => onAddress('')), 700); }
  });
  return {
    setMarkers(markers, fit, _picker, route) {
      drawn.forEach(m => m.setMap(null)); line?.setMap(null); line = null;
      if (route?.length) line = new google.maps.Polyline({ map, path: route.map(([lng, lat]) => ({ lat, lng })), strokeColor: ROUTE_COLOR, strokeOpacity: 0.9, strokeWeight: 6 });
      drawn = markers.map(m => new google.maps.Marker({ map, position: m, title: m.title, icon: m.kind === 'store' ? { url: storeIcon(), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) } : { path: google.maps.SymbolPath.CIRCLE, scale: m.kind === 'courier' ? 9 : 8, fillColor: colors[m.kind], fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }));
      const points: LatLng[] = [...markers, ...(route || []).map(([lng, lat]) => ({ lat, lng }))];
      if (fit && points.length > 1) { const b = new google.maps.LatLngBounds(); points.forEach(p => b.extend(p)); map.fitBounds(b, 56); }
      else if (!picker && markers[0]) map.setCenter(markers[0]);
    },
    panTo: p => map.panTo(p),
    destroy: () => { window.clearTimeout(timer); drawn.forEach(m => m.setMap(null)); line?.setMap(null); },
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
    setMarkers(markers, fit, _picker, route) {
      drawn.forEach(m => m.remove());
      // Road geometry from the routing API only (never a straight line between the points).
      const data = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route || [] } };
      const source = map.getSource('fayz-route');
      if (source) source.setData(data);
      else if (route?.length) {
        map.addSource('fayz-route', { type: 'geojson', data });
        map.addLayer({ id: 'fayz-route-casing', type: 'line', source: 'fayz-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 9 } });
        map.addLayer({ id: 'fayz-route-line', type: 'line', source: 'fayz-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ROUTE_COLOR, 'line-width': 5 } });
      }
      drawn = markers.map(m => {
        const dot = document.createElement('div');
        dot.className = `map-dot map-dot-${m.kind}`; dot.title = m.title; dot.setAttribute('aria-label', m.title); dot.setAttribute('role', 'img');
        if (m.kind === 'store') { const img = document.createElement('img'); img.src = storeIcon(); img.alt = ''; dot.appendChild(img); }
        else dot.style.background = colors[m.kind];
        return new ml.Marker({ element: dot }).setLngLat([m.lng, m.lat]).addTo(map);
      });
      const points: [number, number][] = [...markers.map(m => [m.lng, m.lat] as [number, number]), ...(route || [])];
      if (fit && points.length > 1) { const b = new ml.LngLatBounds(); points.forEach(p => b.extend(p)); map.fitBounds(b, { padding: 64, maxZoom: 16, duration: 0 }); }
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
export function MapView({ apiKey, center, markers = [], route = null, picker, onPick, onAddress, fit, className = '' }: { apiKey?: string; center?: LatLng | null; markers?: MapMarker[]; route?: RouteLine | null; picker?: boolean; onPick?: (p: LatLng) => void; onAddress?: (address: string) => void; fit?: boolean; className?: string }) {
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
  useEffect(() => { if (state === 'ready') engine.current?.setMarkers(markers, !!fit, !!picker, route); }, [state, JSON.stringify(markers), route]);

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
/** `maxAge` 0 forces a fresh fix (used when the customer taps "aniqlash" again after an inaccurate one). */
export function currentPosition(timeout = 15000, maxAge = 30000): Promise<LatLng & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Bu qurilmada joylashuvni aniqlab boʻlmaydi')); return; }
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }), e => reject(new Error(e.code === 1 ? 'Joylashuvga ruxsat berilmadi. Pinni xaritada qoʻlda belgilang.' : e.code === 3 ? 'Joylashuv aniqlanmadi (vaqt tugadi). Qayta urinib koʻring.' : 'Joylashuv aniqlanmadi. GPS yoqilganini tekshiring.')), { enableHighAccuracy: true, timeout, maximumAge: maxAge });
  });
}
