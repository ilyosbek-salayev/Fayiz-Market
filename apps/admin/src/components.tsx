// Presentational building blocks for the admin panel. No API calls or business rules live here.
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from '../../../packages/ui/src/Icon';

export function Modal({ title, subtitle, onClose, children, footer, size = 'md', as = 'div', onSubmit, badge }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; as?: 'div' | 'form'; onSubmit?: (event: React.FormEvent) => void; badge?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key); document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = ''; };
  }, [onClose]);
  const Body = as;
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <Body className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title} ref={ref as never} tabIndex={-1} onSubmit={onSubmit}>
      <div className="modal-head"><div className="modal-title"><h2>{title}</h2>{badge}{subtitle && <p>{subtitle}</p>}</div><button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish"><Icon name="close" /></button></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </Body>
  </div>;
}

export function ConfirmDialog({ title, text, confirmLabel, onConfirm, onCancel, busy }: { title: string; text: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return <Modal title={title} onClose={onCancel} size="sm" footer={<><button type="button" className="btn btn-quiet" onClick={onCancel}>Bekor qilish</button><button type="button" className="btn btn-danger-solid" onClick={onConfirm} disabled={busy}>{confirmLabel}</button></>}><p className="t-body t-muted">{text}</p></Modal>;
}

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field${wide ? ' wide' : ''}`}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span><span className="toggle-text"><span>{label}</span>{hint && <small>{hint}</small>}</span></label>;
}

export function MetricCard({ icon, label, value, caption, loading }: { icon: IconName; label: string; value: ReactNode; caption?: ReactNode; loading?: boolean }) {
  return <div className="metric"><div className="metric-head"><span className="metric-icon"><Icon name={icon} size={20} /></span><span className="metric-label">{label}</span></div>{loading ? <div className="skeleton" style={{ height: 30, width: '70%', marginTop: 14 }} /> : <strong className="metric-value num">{value}</strong>}{caption && <span className="metric-caption">{caption}</span>}</div>;
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><Icon name={icon} size={30} stroke={1.6} /></div><h3 className="t-h2">{title}</h3>{text && <p className="t-body">{text}</p>}{action}</div>;
}

export function Panel({ title, subtitle, actions, children, className = '' }: { title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{(title || actions) && <div className="panel-head"><div>{title && <h3>{title}</h3>}{subtitle && <p>{subtitle}</p>}</div>{actions}</div>}{children}</section>;
}

export function Thumb({ src, size = 48 }: { src?: string; size?: number }) {
  return <span className="thumb" style={{ width: size, height: size }}>{src ? <img src={src} alt="" loading="lazy" /> : <Icon name="image" size={Math.round(size / 2.4)} stroke={1.6} />}</span>;
}

export function IconAction({ icon, label, onClick, tone, disabled, compact }: { icon: IconName; label: string; onClick: () => void; tone?: 'danger'; disabled?: boolean; compact?: boolean }) {
  return <button type="button" className={`act${tone ? ' act-' + tone : ''}${compact ? ' act-icon' : ''}`} onClick={onClick} disabled={disabled} title={compact ? label : undefined}><Icon name={icon} size={17} /><span className={compact ? 'visually-hidden' : undefined}>{label}</span></button>;
}
