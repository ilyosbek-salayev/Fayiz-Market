// Storefront types and the home-screen banner, shared by the customer app and the admin preview so the owner
// sees exactly what customers will see.
import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { BUILT_IN, type Brand } from './brand';

export type Banner = { id: number; title: string; subtitle: string; ctaLabel: string; ctaTarget: string; imageUrl: string; tone: 'accent' | 'dark' | 'light'; active?: boolean; position?: number };
export type PaymentOption = { method: 'cash' | 'card_terminal' | 'bank_transfer' | 'payme' | 'click'; label: string; online: boolean };
export type Storefront = {
  brand: Brand;
  store: { name: string; address: string; lat: number | null; lng: number | null; configured: boolean; phone: string };
  banners: Banner[];
  defaultBanner: { title: string; subtitle: string };
  checkout: { fulfillment: ('delivery' | 'pickup')[]; payments: PaymentOption[]; bankTransferDetails: string; pickupAddress: string; deliveryFee?: number; deliveryFreeFrom?: number; /** 1.2.2+: 'quote' = no tariff yet, staff confirm the fee */ deliveryFeeMode?: 'fixed' | 'free' | 'quote' };
  routing: { available: boolean };
};

/** Storefront derived from GET /settings — used when the server predates GET /storefront. */
export function storefrontFromSettings(s: Record<string, string>): Storefront {
  const lat = Number(s.store_lat), lng = Number(s.store_lng), has = !!s.store_lat && !!s.store_lng && Number.isFinite(lat) && Number.isFinite(lng);
  return {
    brand: { name: s.store_name || 'Fayz Market', tagline: s.brand_tagline ?? 'Aksessuarlar doʻkoni', logoLight: s.brand_logo_light || '', logoDark: s.brand_logo_dark || '' },
    store: { name: s.store_place_name || s.store_name || 'Fayz Market', address: s.store_address || '', lat: has ? lat : null, lng: has ? lng : null, configured: has, phone: s.contact_phone || '' },
    banners: [], defaultBanner: { title: s.banner_title || 'Fayz Market', subtitle: s.banner_subtitle || '' },
    checkout: { fulfillment: ['delivery'], payments: [{ method: 'cash', label: 'Naqd pul', online: false }], bankTransferDetails: '', pickupAddress: '' },
    routing: { available: false },
  };
}

export const paymentStatusNames: Record<string, string> = { pending: 'Toʻlov kutilmoqda', verifying: 'Toʻlov tekshirilmoqda', paid: 'Toʻlandi', failed: 'Toʻlov muvaffaqiyatsiz', cancelled: 'Toʻlov bekor qilingan', refunded: 'Pul qaytarilgan' };
export const paymentStatusBadge: Record<string, string> = { pending: 'new', verifying: 'preparing', paid: 'delivered', failed: 'cancelled', cancelled: 'cancelled', refunded: 'shipped' };
export const paymentMethodNames: Record<string, string> = { cash: 'Naqd pul', card_terminal: 'Karta (terminal)', bank_transfer: 'Bank oʻtkazmasi', payme: 'Payme', click: 'Click' };

/** One promotional banner. Text never sits on the photo: copy and image have their own columns. */
export function BannerCard({ banner, onCta, dark }: { banner: Pick<Banner, 'title' | 'subtitle' | 'ctaLabel' | 'ctaTarget' | 'imageUrl' | 'tone'>; onCta?: () => void; dark?: boolean }) {
  const hasCta = banner.ctaTarget !== 'none' && banner.ctaLabel.trim().length > 0;
  const mark = banner.tone === 'dark' || (banner.tone !== 'light' && dark) ? BUILT_IN.markDark : BUILT_IN.markLight;
  return <article className={`promo promo-${banner.tone}${banner.imageUrl ? ' has-image' : ''}`} aria-label={banner.title}>
    <div className="promo-copy">
      <h2 className="promo-title">{banner.title}</h2>
      {banner.subtitle && <p className="promo-text">{banner.subtitle}</p>}
      {hasCta && <button type="button" className="promo-cta" onClick={onCta}>{banner.ctaLabel}<Icon name="chevron" size={16} stroke={2.2} /></button>}
    </div>
    {banner.imageUrl
      ? <div className="promo-media"><img src={banner.imageUrl} alt="" loading="lazy" decoding="async" /></div>
      : <div className="promo-mark" aria-hidden="true"><img src={mark} alt="" width={104} height={104} /></div>}
  </article>;
}

/** Active banners, or the built-in hero when there are none. Swipe only — no autoplay. */
export function BannerCarousel({ banners, fallback, onCta, dark }: { banners: Banner[]; fallback: { title: string; subtitle: string }; onCta: (target: string) => void; dark?: boolean }) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  if (!banners.length) return <section className="promo-wrap" aria-label="Doʻkon banneri"><BannerCard dark={dark} banner={{ title: fallback.title || 'Fayz Market', subtitle: fallback.subtitle, ctaLabel: 'Katalogni ochish', ctaTarget: 'catalog', imageUrl: '', tone: 'accent' }} onCta={() => onCta('catalog')} /></section>;
  const multi = banners.length > 1;
  const go = (i: number) => { const el = track.current; if (!el) return; const card = el.children[i] as HTMLElement | undefined; if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).paddingLeft || '0'), behavior: 'smooth' }); };
  return <section className="promo-wrap" aria-label="Aksiyalar va eʼlonlar" aria-roledescription="carousel">
    <div ref={track} className={`promo-track${multi ? ' multi' : ''}`} onScroll={e => { const el = e.currentTarget; const w = (el.children[0] as HTMLElement | undefined)?.offsetWidth || el.clientWidth; setIndex(Math.min(banners.length - 1, Math.round(el.scrollLeft / Math.max(1, w + 12)))); }}>
      {banners.map((b, i) => <div className="promo-slide" key={b.id} aria-roledescription="slide" aria-label={`${i + 1} / ${banners.length}`}><BannerCard dark={dark} banner={b} onCta={() => onCta(b.ctaTarget)} /></div>)}
    </div>
    {multi && <div className="promo-dots" role="tablist" aria-label="Bannerlar">{banners.map((b, i) => <button key={b.id} type="button" role="tab" aria-selected={i === index} aria-label={`${i + 1}-banner`} className={i === index ? 'on' : ''} onClick={() => go(i)} />)}</div>}
  </section>;
}
