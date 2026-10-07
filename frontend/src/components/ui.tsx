import { useEffect, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Inbox, Loader2, Search, X } from 'lucide-react'
import { STATUS_COLORS, label } from '../lib/format'

export const cx = clsx

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin', className ?? 'h-5 w-5')} />
}

export function PageHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: string; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon && <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-lg shadow-brand-500/25">{icon}</div>}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className, title, actions, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <div className={cx('card', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  )
}

export function Field({ label: l, error, children, hint, className }: { label?: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {l && <span className="label">{l}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  )
}

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx('input', className)} {...p} />
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cx('input min-h-[80px]', className)} {...p} />
export function Select({ className, options, placeholder, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string | number; label: string }[]; placeholder?: string }) {
  return (
    <select className={cx('input appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 20 20%27 fill=%27%2394a3b8%27%3E%3Cpath d=%27M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z%27/%3E%3C/svg%3E")] bg-[length:1.1rem] bg-[right_.6rem_center] bg-no-repeat pr-9', className)} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Toggle({ checked, onChange, label: l }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2.5 text-sm font-medium">
      <span className={cx('relative h-6 w-11 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
      {l}
    </button>
  )
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return <span className={cx('chip', color ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>{children}</span>
}

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null
  return <span className={cx('chip', STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{label(status)}
  </span>
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', '2xl': 'max-w-7xl' }[size]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="fade-in absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cx('slide-up relative flex max-h-[94vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl', w)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-800">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Confirm({ open, title, message, onConfirm, onClose, danger = true, busy, confirmText = 'Confirm', children }: {
  open: boolean; title: string; message?: ReactNode; onConfirm: () => void; onClose: () => void; danger?: boolean; busy?: boolean; confirmText?: string; children?: ReactNode
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>{busy && <Spinner className="h-4 w-4" />}{confirmText}</button>
    </>}>
      {message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
      {children}
    </Modal>
  )
}

export function Empty({ title = 'Nothing here yet', text, icon }: { title?: string; text?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">{icon ?? <Inbox className="h-7 w-7" />}</div>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
    </div>
  )
}

export function Stat({ label: l, value, icon, tone = 'brand', sub }: { label: string; value: ReactNode; icon?: ReactNode; tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'; sub?: ReactNode }) {
  const tones = {
    brand: 'from-brand-500/15 to-brand-500/5 text-brand-600 dark:text-brand-300',
    emerald: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-300',
    amber: 'from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-300',
    rose: 'from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-300',
    sky: 'from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-300',
    violet: 'from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-300',
  }
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{l}</p>
          <p className="mt-2 truncate text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        {icon && <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br', tones[tone])}>{icon}</div>}
      </div>
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  useEffect(() => {
    const t = setTimeout(() => v !== value && onChange(v), 300)
    return () => clearTimeout(t)
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function Pagination({ page, last, total, onPage }: { page: number; last: number; total: number; onPage: (p: number) => void }) {
  if (last <= 1) return <div className="px-4 py-3 text-xs text-slate-500">{total} record{total === 1 ? '' : 's'}</div>
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
      <span className="text-xs text-slate-500">Page {page} of {last} · {total} records</span>
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
        <button className="btn-secondary btn-sm" disabled={page >= last} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; icon?: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/70">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={cx('inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition',
            value === t.value ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200')}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  )
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="date" className="input w-auto" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} />
      <span className="text-slate-400">→</span>
      <input type="date" className="input w-auto" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} />
    </div>
  )
}
