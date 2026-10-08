import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertOctagon, AlertTriangle, Bell, BellOff, ChevronRight, Info, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Skeleton } from './feedback'
import { cx } from './ui'

type Alert = { key: string; level: 'danger' | 'warning' | 'info'; count: number; title: string; text: string; link: string }

const LEVEL = {
  danger: { icon: AlertOctagon, box: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
  warning: { icon: AlertTriangle, box: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300' },
  info: { icon: Info, box: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' },
}

/** Operational alerts (overdue orders, low stock, open complaints…), refreshed every minute. */
export function NotificationBell() {
  const { branchId } = useAuth()
  const [open, setOpen] = useState(false)
  const q = useQuery({
    queryKey: ['alerts', branchId],
    queryFn: async () => (await api.get<{ alerts: Alert[]; total: number }>('alerts', { params: { branch_id: branchId || undefined } })).data,
    refetchInterval: 60_000,
    meta: { silent: true }, // background polling never raises error toasts
  })
  const alerts = q.data?.alerts ?? []
  const urgent = alerts.some((a) => a.level === 'danger')

  return (
    <div className="relative">
      <button className="btn-icon relative" title="Alerts" aria-label={`Alerts${q.data?.total ? ` (${q.data.total})` : ''}`} onClick={() => setOpen(!open)}>
        <Bell className={cx('h-5 w-5', urgent && 'animate-[wiggle_1s_ease-in-out_2]')} />
        {!!q.data?.total && (
          <span className={cx('absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-950',
            urgent ? 'bg-rose-500' : 'bg-amber-500')}>{q.data.total > 99 ? '99+' : q.data.total}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="slide-up absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="font-bold">Alerts</p>
              <button className="btn-icon p-1.5" title="Refresh" onClick={() => q.refetch()}><RefreshCw className={cx('h-4 w-4', q.isFetching && 'animate-spin')} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {q.isLoading && Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-2"><Skeleton className="h-9 w-9 shrink-0" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-full" /></div></div>
              ))}
              {q.isError && <p className="p-4 text-center text-sm text-rose-600">Could not load alerts.</p>}
              {q.data && !alerts.length && (
                <div className="flex flex-col items-center py-8 text-center text-sm text-slate-500"><BellOff className="mb-2 h-6 w-6" />All clear — nothing needs attention.</div>
              )}
              {alerts.map((a) => {
                const L = LEVEL[a.level]
                return (
                  <Link key={a.key} to={a.link} onClick={() => setOpen(false)} className="group flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', L.box)}><L.icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold">{a.title}<span className={cx('chip', L.box)}>{a.count}</span></span>
                      <span className="mt-0.5 block text-xs text-slate-500">{a.text}</span>
                    </span>
                    <ChevronRight className="mt-2 h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
