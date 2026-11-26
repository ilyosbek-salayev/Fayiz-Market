// Product editor additions (all optional): sale price, characteristics, and variants — colour, model, memory,
// size or any other axis, each combination with its own price, stock, photo and on/off switch.
// The Worker validates everything again (unique combinations, values from the axis list, own images).
import { useState } from 'react';
import { money, variantLabel, type ProductAttribute, type ProductOption } from '@fayz/shared';
import { Icon } from '../../../packages/ui/src/Icon';
import { NumberInput } from '../../../packages/ui/src/NumberInput';

export type VariantDraft = { id?: number; options: Record<string, string>; price: number; comparePrice: number; stock: number; image: string; active: boolean };
export type ProductExtras = { comparePrice: number; options: ProductOption[]; attributes: ProductAttribute[]; variants: VariantDraft[] };
export const emptyExtras: ProductExtras = { comparePrice: 0, options: [], attributes: [], variants: [] };

const AXIS_PRESETS = ['Rang', 'Model', 'Xotira', 'Oʻlcham'];
const ATTRIBUTE_PRESETS = ['Brend', 'Material', 'Rang', 'Oʻlcham', 'Ogʻirligi', 'Kafolat', 'Ishlab chiqaruvchi davlat', 'Toʻplam tarkibi'];
const keyPart = (s: string) => s.trim().toLocaleLowerCase('uz').replace(/\s+/g, ' ');
const comboKey = (options: Record<string, string>, axes: ProductOption[]) => axes.map(a => `${keyPart(a.name)}=${keyPart(options[a.name] || '')}`).join('|');
const MAX_VARIANTS = 100;

/** Every combination of the axis values (cartesian product), in axis order. */
function combinations(axes: ProductOption[]): Record<string, string>[] {
  return axes.reduce<Record<string, string>[]>((acc, axis) => acc.flatMap(base => axis.values.map(v => ({ ...base, [axis.name]: v }))), [{}]);
}
/** Keeps the rows the admin already filled in (matched by combination), adds new combinations, drops vanished ones. */
export function syncVariants(axes: ProductOption[], current: VariantDraft[], basePrice: number): VariantDraft[] {
  const usable = axes.filter(a => a.name.trim() && a.values.length);
  if (!usable.length) return [];
  const byKey = new Map(current.map(v => [comboKey(v.options, usable), v]));
  return combinations(usable).slice(0, MAX_VARIANTS).map(options => {
    const old = byKey.get(comboKey(options, usable));
    return old ? { ...old, options } : { options, price: basePrice, comparePrice: 0, stock: 0, image: '', active: true };
  });
}

export function CharacteristicsEditor({ value, onChange }: { value: ProductAttribute[]; onChange: (next: ProductAttribute[]) => void }) {
  const set = (i: number, patch: Partial<ProductAttribute>) => onChange(value.map((a, n) => n === i ? { ...a, ...patch } : a));
  return <div className="attr-editor">
    {value.length === 0 && <p className="t-caption">Masalan: Material — Charm, Kafolat — 12 oy. Mijoz mahsulot sahifasidagi «Xususiyatlar» boʻlimida koʻradi.</p>}
    <datalist id="attr-presets">{ATTRIBUTE_PRESETS.map(p => <option key={p} value={p} />)}</datalist>
    {value.map((a, i) => <div className="attr-row" key={i}>
      <input className="input" list="attr-presets" value={a.name} onChange={e => set(i, { name: e.target.value })} placeholder="Nomi (masalan, Material)" aria-label={`Xususiyat ${i + 1} nomi`} maxLength={60} />
      <input className="input" value={a.value} onChange={e => set(i, { value: e.target.value })} placeholder="Qiymati (masalan, Charm)" aria-label={`Xususiyat ${i + 1} qiymati`} maxLength={200} />
      <button type="button" className="icon-btn" onClick={() => onChange(value.filter((_, n) => n !== i))} aria-label="Xususiyatni olib tashlash"><Icon name="trash" size={17} /></button>
    </div>)}
    {value.length < 30 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...value, { name: '', value: '' }])}><Icon name="plus" size={16} />Xususiyat qoʻshish</button>}
  </div>;
}

function ValueAdder({ axis, onAdd }: { axis: string; onAdd: (values: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => { const values = text.split(',').map(v => v.trim()).filter(Boolean); if (values.length) onAdd(values); setText(''); };
  return <span className="value-adder">
    <input className="input" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={axis === 'Rang' ? 'Masalan: Qora, Oq' : axis === 'Xotira' ? 'Masalan: 128 GB' : 'Qiymat'} aria-label={`${axis || 'Variant'} qiymati`} maxLength={120} />
    <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={!text.trim()}>Qoʻshish</button>
  </span>;
}

export function VariantsEditor({ value, onChange, images, basePrice, existing }: { value: ProductExtras; onChange: (next: ProductExtras) => void; images: string[]; basePrice: number; existing: boolean }) {
  const axes = value.options, rows = value.variants;
  const setAxes = (next: ProductOption[]) => onChange({ ...value, options: next, variants: syncVariants(next, rows, basePrice) });
  const setRow = (i: number, patch: Partial<VariantDraft>) => onChange({ ...value, variants: rows.map((r, n) => n === i ? { ...r, ...patch } : r) });
  const unused = AXIS_PRESETS.filter(p => !axes.some(a => keyPart(a.name) === keyPart(p)));
  const total = axes.reduce((n, a) => n * Math.max(1, a.values.length), axes.length ? 1 : 0);
  return <div className="variant-editor">
    {!axes.length && <p className="t-caption">Mahsulot bir xil boʻlsa, bu boʻlimni boʻsh qoldiring. Rang, model, xotira yoki oʻlcham boʻyicha farq qilsa — turini qoʻshing, har bir kombinatsiya uchun narx, qoldiq va rasm alohida boʻladi.</p>}
    {axes.map((axis, i) => <div className="axis-card" key={i}>
      <div className="axis-head">
        <input className="input" value={axis.name} onChange={e => setAxes(axes.map((a, n) => n === i ? { ...a, name: e.target.value } : a))} aria-label={`Variant turi ${i + 1}`} placeholder="Variant turi" maxLength={40} />
        <button type="button" className="icon-btn" onClick={() => setAxes(axes.filter((_, n) => n !== i))} aria-label={`«${axis.name}» turini olib tashlash`}><Icon name="trash" size={17} /></button>
      </div>
      <div className="chip-set">{axis.values.map(v => <span className="value-chip" key={v}>{v}<button type="button" onClick={() => setAxes(axes.map((a, n) => n === i ? { ...a, values: a.values.filter(x => x !== v) } : a))} aria-label={`${v} ni olib tashlash`}><Icon name="close" size={14} /></button></span>)}</div>
      <ValueAdder axis={axis.name} onAdd={values => setAxes(axes.map((a, n) => n === i ? { ...a, values: [...a.values, ...values.filter(v => !a.values.some(x => keyPart(x) === keyPart(v)))].slice(0, 30) } : a))} />
    </div>)}
    {axes.length < 3 && <div className="axis-presets">{unused.map(p => <button type="button" key={p} className="btn btn-secondary btn-sm" onClick={() => setAxes([...axes, { name: p, values: [] }])}><Icon name="plus" size={16} />{p}</button>)}<button type="button" className="btn btn-quiet btn-sm" onClick={() => setAxes([...axes, { name: '', values: [] }])}><Icon name="plus" size={16} />Boshqa tur</button></div>}
    {total > MAX_VARIANTS && <div className="banner banner-warning"><Icon name="alert" size={20} /><div>Kombinatsiyalar soni {total} — eng koʻpi {MAX_VARIANTS} ta saqlanadi. Qiymatlarni kamaytiring.</div></div>}
    {rows.length > 0 && <>
      <div className="variant-bulk"><span className="t-caption num">{rows.length} ta variant · {rows.filter(r => r.active).length} ta faol</span><button type="button" className="btn btn-quiet btn-sm" onClick={() => onChange({ ...value, variants: rows.map(r => ({ ...r, price: basePrice })) })}>Barcha narxlarni {money(basePrice)} qilish</button></div>
      <ul className="variant-rows">{rows.map((r, i) => <li key={comboKey(r.options, axes)} className={r.active ? '' : 'inactive'}>
        <div className="variant-name"><strong>{variantLabel(r.options, axes) || '—'}</strong>{r.id ? <span className="t-caption num">Qoldiq: {r.stock} dona</span> : null}</div>
        <label className="variant-field"><span>Narx</span><NumberInput value={r.price} onChange={price => setRow(i, { price })} suffix="soʻm" aria-label={`${variantLabel(r.options, axes)} narxi`} /></label>
        <label className="variant-field"><span>Chegirmagacha</span><NumberInput value={r.comparePrice} onChange={comparePrice => setRow(i, { comparePrice })} suffix="soʻm" aria-label={`${variantLabel(r.options, axes)} chegirmagacha narxi`} placeholder="—" /></label>
        {r.id ? null : <label className="variant-field"><span>Qoldiq</span><NumberInput value={r.stock} onChange={stock => setRow(i, { stock })} suffix="dona" max={1_000_000} aria-label={`${variantLabel(r.options, axes)} qoldigʻi`} /></label>}
        <label className="variant-field"><span>Rasm</span><select className="input" value={r.image} onChange={e => setRow(i, { image: e.target.value })} aria-label={`${variantLabel(r.options, axes)} rasmi`}><option value="">Asosiy rasm</option>{images.map((url, n) => <option key={url} value={url}>{n + 1}-rasm</option>)}</select>{r.image && <img className="variant-thumb" src={r.image} alt="" />}</label>
        <label className="variant-active"><input type="checkbox" checked={r.active} onChange={e => setRow(i, { active: e.target.checked })} /><span>Sotuvda</span></label>
      </li>)}</ul>
      {existing && <p className="t-caption">Mavjud variant qoldigʻi «Qoldiq» tugmasi orqali (sabab bilan) oʻzgaradi. Yangi qoʻshilgan variantning boshlangʻich qoldigʻini shu yerda kiriting.</p>}
    </>}
  </div>;
}
