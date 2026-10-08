import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { Modal, Spinner, cx } from './ui'

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cx('animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800', className)} />
)

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cx('h-4', c === 0 ? 'w-32' : c === cols - 1 ? 'ml-auto w-20' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Generic page placeholder: header, stat cards and a table. */
export function PageLoader({ stats = 0, table = true, header = true }: { stats?: number; table?: boolean; header?: boolean }) {
  return (
    <div className="fade-in space-y-6" aria-busy="true" aria-label="Loading page">
      {header && <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-2xl" />
        <div className="space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-3 w-72" /></div>
      </div>}
      {stats > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="card space-y-3 p-5"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-36" /><Skeleton className="h-3 w-28" /></div>
          ))}
        </div>
      )}
      {table && <div className="card overflow-hidden"><div className="border-b border-slate-100 p-4 dark:border-slate-800"><Skeleton className="h-10 w-full max-w-md" /></div><TableSkeleton /></div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Error state                                                         */
/* ------------------------------------------------------------------ */

export function ErrorState({ error, onRetry, title, compact }: { error?: unknown; onRetry?: () => void; title?: string; compact?: boolean }) {
  const status = (error as any)?.response?.status
  const forbidden = status === 403
  const [busy, setBusy] = useState(false)
  return (
    <div role="alert" className={cx('flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-16')}>
      <div className={cx('mb-3 grid h-14 w-14 place-items-center rounded-2xl', forbidden ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15' : 'bg-rose-100 text-rose-600 dark:bg-rose-500/15')}>
        {forbidden ? <ShieldAlert className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
      </div>
      <p className="font-semibold text-slate-800 dark:text-slate-100">
        {title ?? (forbidden ? 'Access denied' : status === 404 ? 'Not found' : 'Something went wrong')}
      </p>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        {!error ? '' : (error as any)?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Check that the backend is running and your connection is up.' : errorMessage(error)}
      </p>
      {onRetry && !forbidden && status !== 404 && (
        <button className="btn-secondary mt-4" disabled={busy} onClick={async () => { setBusy(true); try { await onRetry() } finally { setBusy(false) } }}>
          <RefreshCw className={cx('h-4 w-4', busy && 'animate-spin')} />Try again
        </button>
      )}
    </div>
  )
}

/** Renders loader / error / content for a react-query result. */
export function Loadable<T>({ query, loader, children }: {
  query: { data: T | undefined; isError: boolean; error: unknown; refetch: () => unknown }
  loader?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.data !== undefined) return <>{children(query.data)}</>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  return <>{loader ?? <PageLoader />}</>
}

/* ------------------------------------------------------------------ */
/* Async button: spinner + disabled while the promise runs            */
/* ------------------------------------------------------------------ */

type AsyncButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => unknown | Promise<unknown>
  icon?: ReactNode
}
export function AsyncButton({ onClick, icon, children, disabled, className = 'btn-primary', ...rest }: AsyncButtonProps) {
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  return (
    <button {...rest} className={className} disabled={disabled || busy} aria-busy={busy}
      onClick={async (e) => {
        if (busy) return
        setBusy(true)
        try { await onClick(e) } finally { if (alive.current) setBusy(false) }
      }}>
      {busy ? <Spinner className="h-4 w-4" /> : icon}{children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Promise-based confirm dialog: `if (await confirm({...})) ...`       */
/* ------------------------------------------------------------------ */

type ConfirmOptions = { title: string; message?: ReactNode; confirmText?: string; danger?: boolean }
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>
const ConfirmCtx = createContext<ConfirmFn>(async () => false)
export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => { state?.resolve(v); setState(null) }
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''} size="sm" footer={<>
        <button className="btn-secondary" onClick={() => close(false)}>Cancel</button>
        <button autoFocus className={state?.danger === false ? 'btn-primary' : 'btn-danger'} onClick={() => close(true)}>{state?.confirmText ?? 'Confirm'}</button>
      </>}>
        {state?.message && <div className="text-sm text-slate-600 dark:text-slate-300">{state.message}</div>}
      </Modal>
    </ConfirmCtx.Provider>
  )
}

/* ------------------------------------------------------------------ */
/* Top progress bar for any network activity                          */
/* ------------------------------------------------------------------ */

export function TopProgress() {
  const active = useIsFetching() + useIsMutating() > 0
  const [visible, setVisible] = useState(false)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let tick: ReturnType<typeof setInterval>
    if (active) {
      // Short delay avoids a flash for instant (cached) responses.
      timer = setTimeout(() => {
        setVisible(true)
        setWidth(15)
        tick = setInterval(() => setWidth((w) => (w < 85 ? w + (90 - w) * 0.08 : w)), 200)
      }, 150)
    } else {
      setWidth(100)
      timer = setTimeout(() => { setVisible(false); setWidth(0) }, 300)
    }
    return () => { clearTimeout(timer); clearInterval(tick) }
  }, [active])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]" aria-hidden>
      <div className={cx('h-full bg-gradient-to-r from-brand-500 via-accent-400 to-brand-500 shadow-[0_0_10px_rgba(99,102,241,.7)] transition-all duration-200',
        visible ? 'opacity-100' : 'opacity-0')} style={{ width: `${width}%` }} />
    </div>
  )
}
