// Real road routes. Map tiles alone cannot draw a route, so a routing service is required:
//  • OpenRouteService (ORS_API_KEY) — free tier, OpenStreetMap data, attribution required;
//  • Google Routes (GOOGLE_ROUTES_KEY) — paid per request after the free monthly quota.
// When neither key exists the API says so (503 ROUTES_NOT_CONFIGURED) and the apps offer external navigation
// instead — a straight line is never presented as a road.
import { fail, providerBase, type Bindings } from './lib';

export type LatLng = { lat: number; lng: number };
export type Route = { provider: 'openrouteservice' | 'google'; attribution: string; distanceMeters: number; durationSeconds: number; coordinates: [number, number][]; polyline: string | null };

export const routingProvider = (env: Bindings): Route['provider'] | null => env.ORS_API_KEY ? 'openrouteservice' : env.GOOGLE_ROUTES_KEY ? 'google' : null;

/** Google encoded polyline → [lng, lat] pairs. */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []; let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, byte: number;
      do { byte = encoded.charCodeAt(i++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && i <= encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta; else lng += delta;
    }
    points.push([lng / 1e5, lat / 1e5]);
  }
  return points;
}

export async function computeRoute(env: Bindings, from: LatLng, to: LatLng): Promise<Route> {
  const provider = routingProvider(env);
  if (!provider) fail(503, 'ROUTES_NOT_CONFIGURED', 'Marshrut xizmati hali ulanmagan — navigatsiya ilovasidan foydalaning');
  if (provider === 'openrouteservice') {
    const res = await fetch(`${providerBase(env, 'ors', 'https://api.openrouteservice.org')}/v2/directions/driving-car/geojson`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json', Authorization: env.ORS_API_KEY! },
      body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]], units: 'm', language: 'en' }),
    });
    const data = await res.json<any>().catch(() => null);
    const feature = data?.features?.[0];
    if (!res.ok || !feature?.geometry?.coordinates?.length) fail(502, 'ROUTE_FAILED', res.status === 404 || data?.error?.code === 2010 ? 'Bu nuqtalar orasida yoʻl topilmadi' : 'Marshrut hisoblanmadi');
    return {
      provider, attribution: '© openrouteservice.org by HeiGIT · © OpenStreetMap', polyline: null,
      distanceMeters: Math.round(feature.properties?.summary?.distance ?? 0), durationSeconds: Math.round(feature.properties?.summary?.duration ?? 0),
      coordinates: feature.geometry.coordinates.map((p: number[]) => [p[0], p[1]] as [number, number]),
    };
  }
  const res = await fetch(`${providerBase(env, 'routes', 'https://routes.googleapis.com')}/directions/v2:computeRoutes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_ROUTES_KEY!, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' },
    body: JSON.stringify({ origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } }, destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', languageCode: 'uz' }),
  });
  const data = await res.json<any>().catch(() => ({}));
  const route = data?.routes?.[0];
  if (!res.ok || !route) fail(502, 'ROUTE_FAILED', 'Marshrut hisoblanmadi');
  const polyline = route.polyline?.encodedPolyline || null;
  return { provider: 'google', attribution: 'Google', distanceMeters: route.distanceMeters, durationSeconds: Number(String(route.duration).replace('s', '')), polyline, coordinates: polyline ? decodePolyline(polyline) : [] };
}
