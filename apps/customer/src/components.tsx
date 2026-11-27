// Presentational building blocks for the customer app. No API calls or business rules live here.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { money } from '@fayz/shared';
import type { Product } from '@fayz/shared';
import { Icon, type IconName } from '../../../packages/ui/src/Icon';
import { useBackClose } from '../../../packages/ui/src/back';

export function ProductImage({ src, alt = '', fit = 'cover' }: { src?: string; alt?: string; fit?: 'cover' | 'contain' }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [src]);
  if (!src || failed) return <div className="img-placeholder" role="img" aria-label={alt ? `${alt}: rasm mavjud emas` : 'Rasm mavjud emas'}><Icon name="bag" size={30} stroke={1.5} /></div>;
  return <img className={`img-${fit}${loaded ? ' is-loaded' : ''}`} src={src} alt={alt} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />;
}

export function StockLabel({ stock }: { stock: number }) {
  if (!stock) return <span className="stock stock-out">Sotuvda yoʻq</span>;
  return <span className="stock">{stock} dona mavjud</span>;
}

export function ProductCard({ product, inCart, onOpen, onAdd, rail }: { product: Product; inCart: number; onOpen: () => void; onAdd: () => void; rail?: boolean }) {
  const soldOut = !product.stock;
  const multiPrice = !!product.variantCount && !!product.priceTo && product.priceTo !== product.priceFrom;
  const sale = !!product.comparePrice && product.comparePrice > product.price;
  return <article className={`pcard${rail ? ' pcard-rail' : ''}${soldOut ? ' is-out' : ''}`}>
    <div className="pcard-media">
      <button className="pcard-media-hit" onClick={onOpen} tabIndex={-1} aria-hidden="true"><ProductImage src={product.images[0]} /></button>
      {soldOut && <span className="pcard-flag">Sotuvda yoʻq</span>}
      <button className={`pcard-add${inCart ? ' has-count' : ''}`} onClick={onAdd} disabled={soldOut || inCart >= product.stock} aria-label={`${product.name} — savatga qoʻshish${inCart ? ` (savatda ${inCart})` : ''}`}>
        {inCart > 0 ? <span className="num">{inCart}</span> : <Icon name="plus" size={18} stroke={2.2} />}
      </button>
    </div>
    <button className="pcard-hit" onClick={onOpen} aria-label={`${product.name}, ${money(product.price)}${multiPrice ? ' dan' : ''}`}>
      <span className="pcard-cat">{product.categoryName}</span>
      <span className="pcard-name">{product.name}</span>
      <span className="pcard-foot"><span className="price num">{money(product.price)}{multiPrice && <small> dan</small>}{!multiPrice && sale && <s className="old-price"> {money(product.comparePrice!)}</s>}</span>{!soldOut && <StockLabel stock={product.stock} />}</span>
      {product.variantCount ? <span className="pcard-variants">{product.variantCount} ta variant</span> : null}
    </button>
  </article>;
}

export function ProductSkeleton() {
  return <div className="pcard pcard-skeleton" aria-hidden="true"><div className="pcard-media skeleton" /><div className="skeleton" style={{ height: 10, width: '45%', marginTop: 12 }} /><div className="skeleton" style={{ height: 14, width: '85%', marginTop: 8 }} /><div className="skeleton" style={{ height: 16, width: '55%', marginTop: 14 }} /></div>;
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><Icon name={icon} size={32} stroke={1.6} /></div><h2 className="t-h2">{title}</h2>{text && <p className="t-body">{text}</p>}{action}</div>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="section-head"><h2 className="t-h2">{title}</h2>{action}</div>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}</label>;
}

export function Toast({ message, action, onAction, onDone }: { message: string; action?: string; onAction?: () => void; onDone: () => void }) {
  useEffect(() => { const timer = setTimeout(onDone, 2600); return () => clearTimeout(timer); }, [message, onDone]);
  return <div className="toast" role="status"><Icon name="check" size={18} stroke={2.2} /><span>{message}</span>{action && <button onClick={() => { onAction?.(); onDone(); }}>{action}</button>}</div>;
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Focus moves to the sheet once, when it opens. A parent re-render (a typed character) must not steal focus
  // from the field being edited, so the latest onClose is read through a ref instead of re-running the effect.
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useBackClose(true, () => closeRef.current());
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', key); document.body.style.overflow = 'hidden';
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = ''; };
  }, []);
  return <div className="sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeRef.current(); }}>
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
      <div className="sheet-grip" aria-hidden="true" />
      <div className="sheet-head"><h2 className="t-h1">{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Yopish"><Icon name="close" /></button></div>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-foot">{footer}</div>}
    </div>
  </div>;
}

/** Keeps a focused field visible above the Android soft keyboard. */
export function revealOnFocus(event: React.FocusEvent<HTMLElement>) {
  const target = event.currentTarget;
  setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 280);
}
