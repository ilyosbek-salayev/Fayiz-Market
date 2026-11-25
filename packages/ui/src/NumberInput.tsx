// Whole-number input for prices, stock and amounts.
//  • Shows thousands groups while typing: 1000000 → «1 000 000».
//  • 0 is shown as an empty field with a "0" placeholder, so the first digit replaces it (no «0150000»).
//  • The caret stays after the digit just typed even when group spaces are inserted or removed.
//  • Mobile keyboards open the digit pad (inputMode numeric); pasted text keeps only its digits.
import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';

const SPACE = ' '; // non-breaking: a price never wraps in the middle
export const groupDigits = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, SPACE);
/** Text shown for a value: '' for 0 (placeholder shows it), grouped digits otherwise. */
export function formatNumber(value: number, allowNegative = false) {
  if (!Number.isFinite(value) || value === 0) return '';
  const negative = allowNegative && value < 0;
  return (negative ? '-' : '') + groupDigits(String(Math.trunc(Math.abs(value))));
}
/** Parses what the user typed: digits only (and a leading minus when allowed); empty → 0. */
export function parseNumber(text: string, allowNegative = false) {
  const negative = allowNegative && text.trim().startsWith('-');
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const value = digits ? Number(digits) : 0;
  return { value: negative ? -value : value, negative, digits };
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: number; onChange: (value: number) => void; min?: number; max?: number; allowNegative?: boolean; suffix?: string;
};
export function NumberInput({ value, onChange, min, max = 999_999_999_999, allowNegative = false, suffix, className = 'input num', placeholder = '0', ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => formatNumber(value, allowNegative));
  const caret = useRef<number | null>(null); // digits (and minus) that should sit left of the caret after render
  // Follow outside changes (form reset, a remaining amount) without fighting the user's typing.
  useLayoutEffect(() => { if (parseNumber(text, allowNegative).value !== value) setText(formatNumber(value, allowNegative)); }, [value]);
  useLayoutEffect(() => {
    const el = ref.current, wanted = caret.current;
    if (!el || wanted === null || document.activeElement !== el) return;
    let pos = 0, seen = 0;
    while (pos < el.value.length && seen < wanted) { if (/[\d-]/.test(el.value[pos])) seen++; pos++; }
    el.setSelectionRange(pos, pos); caret.current = null;
  }, [text]);
  const input = <input {...rest} ref={ref} type="text" inputMode={allowNegative ? 'text' : 'numeric'} autoComplete="off" className={className} placeholder={placeholder} value={text}
    onChange={e => {
      const raw = e.target.value, at = e.target.selectionStart ?? raw.length;
      const { value: next, negative, digits } = parseNumber(raw, allowNegative);
      const capped = Math.max(allowNegative ? -max : (min ?? 0), Math.min(max, next));
      if (capped !== next) { setText(formatNumber(capped, allowNegative)); onChange(capped); return; }
      // The caret keeps its place among the digits: count digits left of it, minus leading zeros that get dropped.
      const left = raw.slice(0, at), leftDigits = left.replace(/\D/g, '').length;
      const allDigits = raw.replace(/\D/g, ''), dropped = allDigits.length - digits.length;
      caret.current = (negative && left.includes('-') ? 1 : 0) + leftDigits - Math.min(dropped, leftDigits);
      setText((negative ? '-' : '') + (digits ? groupDigits(digits) : ''));
      onChange(next);
    }} />;
  return suffix ? <span className="number-input"><span className="number-input-field">{input}</span><span className="number-input-suffix" aria-hidden="true">{suffix}</span></span> : input;
}
