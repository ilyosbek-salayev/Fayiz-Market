// Fayz Market brand in the apps. The approved logos are bundled (work offline, first paint); an owner can replace
// the light/dark symbol from Admin → Sozlamalar → Brend va koʻrinish without a new APK. A replaced logo is cached
// on the device, so the last one seen keeps working offline; any failure falls back to the bundled logo.
// OS-level icons (Android launcher, status-bar icon, desktop icon) are separate and change only with a new build.
import { useEffect, useState } from 'react';
import markLight from './brand/mark-light.webp';
import markDark from './brand/mark-dark.webp';
import logoLight from './brand/logo-light.webp';
import logoDark from './brand/logo-dark.webp';

export type Brand = { name: string; tagline: string; logoLight: string; logoDark: string };
export const BUILT_IN = { markLight, markDark, logoLight, logoDark };
export const DEFAULT_BRAND: Brand = { name: 'Fayz Market', tagline: 'Aksessuarlar doʻkoni', logoLight: '', logoDark: '' };

const CACHE_KEY = 'fayz_brand_v1';
type Cached = Brand & { files?: Record<string, string> }; // url → data: URI of a replaced logo
const readCache = (): Cached | null => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };

/** True while the dark theme is active (customer "Qora" theme, admin dark mode). */
export const isDarkTheme = () => document.documentElement.dataset.theme === 'black';

/** Last brand seen on this device (or the built-in one) — usable before the network answers. */
export function cachedBrand(): Cached { return readCache() ?? DEFAULT_BRAND; }

async function toDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/^image\/(png|webp|jpeg)$/.test(blob.type) || blob.size > 400_000) return null;
    return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => resolve(null); reader.readAsDataURL(blob); });
  } catch { return null; } // offline, or cross-origin (desktop app): the plain URL is used instead
}

/** Keeps the brand from the server, caches replaced logos for offline use and returns what to render. */
export function useBrand(remote: Partial<Brand> | null | undefined): Cached {
  const [brand, setBrand] = useState<Cached>(cachedBrand);
  useEffect(() => {
    if (!remote) return;
    const next: Brand = { ...DEFAULT_BRAND, ...Object.fromEntries(Object.entries(remote).filter(([, v]) => typeof v === 'string')) } as Brand;
    let cancelled = false;
    void (async () => {
      const old = readCache()?.files || {};
      const files: Record<string, string> = {};
      for (const url of [next.logoLight, next.logoDark]) if (url) files[url] = old[url] || (await toDataUri(url)) || '';
      if (cancelled) return;
      const value: Cached = { ...next, files: Object.fromEntries(Object.entries(files).filter(([, v]) => v)) };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch { try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* storage full */ } }
      setBrand(value);
    })();
    return () => { cancelled = true; };
  }, [remote?.name, remote?.tagline, remote?.logoLight, remote?.logoDark]);
  return brand;
}

/** Symbol URL for the current theme: cached replacement → replacement URL → bundled logo. */
export function markSource(brand: Cached, dark = isDarkTheme()) {
  const url = dark ? brand.logoDark || brand.logoLight : brand.logoLight || brand.logoDark;
  if (!url) return dark ? markDark : markLight;
  return brand.files?.[url] || url;
}

/** The brand symbol (shopping cart with F) — square, never stretched or cropped. */
export function BrandMark({ size = 36, brand, dark, className = '' }: { size?: number; brand?: Cached; dark?: boolean; className?: string }) {
  const isDark = dark ?? isDarkTheme();
  const src = markSource(brand ?? cachedBrand(), isDark);
  const fallback = isDark ? markDark : markLight;
  return <img className={`brand-mark ${className}`} src={src} width={size} height={size} alt="" aria-hidden="true" draggable={false} decoding="async"
    style={{ width: size, height: size, objectFit: 'contain' }}
    onError={e => { if (e.currentTarget.src !== new URL(fallback, location.href).href) e.currentTarget.src = fallback; }} />;
}

/** Full lockup (symbol + "FAYZ MARKET") from the approved artwork — login and lock screens. */
export function BrandLogo({ width = 180, dark, label = 'Fayz Market' }: { width?: number; dark?: boolean; label?: string }) {
  const isDark = dark ?? isDarkTheme();
  return <img className="brand-logo" src={isDark ? logoDark : logoLight} width={width} height={Math.round(width * 1.25)} alt={label} draggable={false} style={{ width, height: 'auto' }} />;
}
