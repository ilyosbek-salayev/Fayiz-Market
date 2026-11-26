// Product page: photos, variant choice (colour, model, memory, size…), price and stock of the chosen variant,
// characteristics, a description that opens with "Batafsil", reviews and related products from the catalogue.
import { useEffect, useMemo, useState } from 'react';
import { money, type Product, type ProductVariant } from '@fayz/shared';
import { Icon } from '../../../packages/ui/src/Icon';
import { ProductCard, ProductImage, SectionHeader } from './components';
import { ProductReviews, type Api } from './account';

export const lineKey = (productId: number, variantId?: number | null) => variantId ? `${productId}:${variantId}` : String(productId);
export const hasVariants = (p: Product) => !!(p.variantCount || p.variants?.length);
const LONG_TEXT = 240;

/** First in-stock variant (or the first one) — its options are the initial selection. */
function initialSelection(p: Product): Record<string, string> {
  const vs = p.variants || [];
  const pick = vs.find(v => v.stock > 0) || vs[0];
  return pick ? { ...pick.options } : {};
}
const matches = (v: ProductVariant, sel: Record<string, string>) => Object.entries(sel).every(([k, val]) => v.options[k] === val);

export function discountPercent(price: number, compare?: number) { return compare && compare > price ? Math.round((1 - price / compare) * 100) : 0; }

function Gallery({ images, name }: { images: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return <div className="gallery"><div className="slide"><ProductImage alt={name} /></div></div>;
  return <div className="gallery-wrap"><div className="gallery" onScroll={e => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}>{images.map((url, i) => <div className="slide" key={url + i}><ProductImage src={url} alt={`${name} ${i + 1}`} fit="contain" /></div>)}</div>{images.length > 1 && <div className="dots" aria-hidden="true">{images.map((_, i) => <span key={i} className={i === index ? 'on' : ''} />)}</div>}</div>;
}

function Description({ text }: { text: string }) {
  const long = text.length > LONG_TEXT || text.split('\n').length > 4;
  const [open, setOpen] = useState(false);
  return <div className="detail-desc"><h2 className="t-label">Tavsif</h2>
    <p className={`t-body desc-text${long && !open ? ' clamped' : ''}`}>{text}</p>
    {long && <button type="button" className="link-btn desc-toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? <>Yopish<Icon name="chevron" size={16} /></> : <>Batafsil koʻrish<Icon name="chevron" size={16} /></>}</button>}
  </div>;
}

export function ProductDetail({ api, product, inCart, cartQty, onAdd, onBack, onShare, onOpen, onQuickAdd }: {
  api: Api; product: Product; inCart: (productId: number) => number; cartQty: (key: string) => number;
  onAdd: (product: Product, variant: ProductVariant | null) => void; onBack: () => void; onShare: (p: Product) => void; onOpen: (p: Product) => void; onQuickAdd: (p: Product) => void;
}) {
  const axes = product.options || [], variants = product.variants || [];
  const [selection, setSelection] = useState<Record<string, string>>(() => initialSelection(product));
  const [related, setRelated] = useState<Product[]>([]);
  useEffect(() => { setSelection(initialSelection(product)); }, [product.id, variants.length]);
  useEffect(() => {
    let live = true; setRelated([]);
    api<{ products: Product[] }>(`/products/${encodeURIComponent(product.slug)}/related?limit=8`).then(r => { if (live) setRelated(r.products); }).catch(() => undefined);
    return () => { live = false; };
  }, [product.slug]);
  const variantMode = axes.length > 0 && variants.length > 0;
  const chosen = variantMode ? variants.find(v => axes.every(a => v.options[a.name] === selection[a.name])) ?? null : null;
  const missing = variantMode ? axes.filter(a => !selection[a.name]).map(a => a.name) : [];
  const price = chosen ? chosen.price : product.price;
  const compare = chosen ? chosen.comparePrice : product.comparePrice || 0;
  const stock = variantMode ? chosen?.stock ?? 0 : product.stock;
  const key = lineKey(product.id, chosen?.id);
  const qty = cartQty(key);
  const images = useMemo(() => chosen?.image ? [chosen.image, ...product.images.filter(u => u !== chosen.image)] : product.images, [chosen?.image, product.images]);
  /** A value is "available" if some in-stock variant has it together with the other chosen values. */
  const available = (axis: string, value: string) => variants.some(v => v.options[axis] === value && v.stock > 0 && axes.every(a => a.name === axis || !selection[a.name] || v.options[a.name] === selection[a.name]));
  const choose = (axis: string, value: string) => setSelection(old => {
    const next = { ...old, [axis]: value };
    if (variants.some(v => matches(v, next))) return next;
    // That combination does not exist: keep the new value and take the rest from the best variant having it.
    const fallback = variants.find(v => v.options[axis] === value && v.stock > 0) || variants.find(v => v.options[axis] === value);
    return fallback ? { ...fallback.options } : next;
  });
  const swatch = (axis: string, value: string) => /rang|color|colour|цвет/i.test(axis) ? variants.find(v => v.options[axis] === value && v.image)?.image : undefined;
  const percent = discountPercent(price, compare);
  const buttonText = missing.length ? `${missing[0]}ni tanlang` : !stock ? 'Sotuvda yoʻq' : qty >= stock ? 'Hammasi savatda' : 'Savatga qoʻshish';
  return <div className="detail">
    <div className="detail-bar"><button className="icon-btn filled" onClick={onBack} aria-label="Orqaga"><Icon name="back" /></button><button className="icon-btn filled" onClick={() => onShare(product)} aria-label="Ulashish"><Icon name="share" size={20} /></button></div>
    <Gallery key={images[0] || 'none'} images={images} name={product.name} />
    <div className="detail-info">
      <span className="t-caption">{product.categoryName}</span>
      <h1 className="t-h1">{product.name}</h1>
      <div className="detail-price-row">
        <p className="detail-price num">{!chosen && variantMode && product.priceTo && product.priceTo !== product.priceFrom ? <>{money(product.priceFrom ?? price)}<small> dan</small></> : money(price)}</p>
        {percent > 0 && <><s className="old-price num">{money(compare)}</s><span className="badge badge-danger discount-badge num">−{percent}%</span></>}
      </div>
      {variantMode && <div className="variant-picker">{axes.map(axis => <div className="variant-axis" key={axis.name} role="radiogroup" aria-label={axis.name}>
        <span className="t-label">{axis.name}{selection[axis.name] ? <b>: {selection[axis.name]}</b> : null}</span>
        <div className="variant-options">{axis.values.map(value => { const img = swatch(axis.name, value), on = selection[axis.name] === value, ok = available(axis.name, value);
          return <button type="button" key={value} role="radio" aria-checked={on} className={`variant-opt${on ? ' on' : ''}${ok ? '' : ' out'}${img ? ' with-img' : ''}`} onClick={() => choose(axis.name, value)} title={ok ? value : `${value} — sotuvda yoʻq`}>{img && <img src={img} alt="" />}<span>{value}</span></button>; })}</div>
      </div>)}</div>}
      <span className={`badge ${stock ? 'badge-ok' : 'badge-danger'}`}>{missing.length ? `${missing.join(', ')} tanlanmagan` : stock ? `${stock} dona mavjud` : 'Hozir sotuvda yoʻq'}</span>
      {(product.attributes?.length || chosen) ? <div className="detail-specs"><h2 className="t-label">Xususiyatlar</h2><dl>
        {chosen && axes.map(a => <div key={'o' + a.name}><dt>{a.name}</dt><dd>{chosen.options[a.name]}</dd></div>)}
        {(product.attributes || []).map((a, i) => <div key={i}><dt>{a.name}</dt><dd>{a.value}</dd></div>)}
      </dl></div> : null}
      {product.description && <Description key={product.id} text={product.description} />}
      <ProductReviews api={api} slug={product.slug} />
      {related.length > 0 && <section className="block related"><SectionHeader title="Sizga ham yoqishi mumkin" /><div className="rail products-rail">{related.map(p => <ProductCard key={p.id} product={p} rail inCart={inCart(p.id)} onOpen={() => onOpen(p)} onAdd={() => onQuickAdd(p)} />)}</div></section>}
    </div>
    <div className="action-bar">
      <div className="action-meta"><span className="t-caption">{qty ? `Savatda: ${qty} dona` : chosen ? chosen.label || 'Narxi' : 'Narxi'}</span><strong className="num">{money(price)}</strong></div>
      <button className="btn btn-primary btn-lg" disabled={!!missing.length || !stock || qty >= stock} onClick={() => onAdd(product, chosen)}><Icon name="bag" size={20} />{buttonText}</button>
    </div>
  </div>;
}
