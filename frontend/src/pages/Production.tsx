import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { AlertTriangle, ChevronRight, LayoutGrid, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ORDER_FLOW, label, money, qty } from '../lib/format'
import { PageHeader, SearchInput, Spinner, StatusBadge, cx } from '../components/ui'

const COLS = ORDER_FLOW.filter((s) => s !== 'delivered')

/** Order status tracking board (module 16): Received → Washing → Drying → Ironing → Ready. */
export default function Production() {
  const { branchId } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<number[]>([])
  const [busy, setBusy] = useState(false)

  const data = useQuery({
    queryKey: ['production', branchId, q],
    queryFn: async () => {
      const res = await Promise.all(COLS.map((s) => api.get('orders', { params: { status: s, per_page: 100, sort: 'delivery_at', dir: 'asc', q, branch_id: branchId || undefined } })))
      return Object.fromEntries(COLS.map((s, i) => [s, res[i].data.data])) as Record<string, any[]>
    },
    refetchInterval: 60_000,
  })

  const move = async (ids: number[], status: string) => {
    setBusy(true)
    try {
      const { data: r } = await api.post('orders/bulk-status', { ids, status })
      const errs = Object.entries(r.errors ?? {})
      if (errs.length) errs.forEach(([no, m]) => toast.error(`${no}: ${m}`))
      else toast.success(`${ids.length} order(s) moved to ${label(status)}`)
      setSel([])
      qc.invalidateQueries({ queryKey: ['production'] })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const next = (s: string) => ORDER_FLOW[ORDER_FLOW.indexOf(s as any) + 1]

  return (
    <div>
      <PageHeader title="Production Board" subtitle="Move garments through each stage. Ready orders trigger the customer SMS." icon={<LayoutGrid className="h-5 w-5" />}
        actions={<>
          <SearchInput value={q} onChange={setQ} placeholder="Filter orders…" className="w-60" />
          <button className="btn-secondary" onClick={() => data.refetch()}><RefreshCw className={cx('h-4 w-4', data.isFetching && 'animate-spin')} /></button>
        </>} />

      {sel.length > 0 && (
        <div className="slide-up sticky top-20 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-900 p-3 text-white shadow-xl">
          <span className="px-2 text-sm font-semibold">{sel.length} selected · move to</span>
          {ORDER_FLOW.map((s) => <button key={s} disabled={busy} className="btn-sm rounded-lg bg-white/10 font-semibold hover:bg-white/20" onClick={() => move(sel, s)}>{label(s)}</button>)}
          <button className="btn-sm ml-auto rounded-lg text-white/70 hover:text-white" onClick={() => setSel([])}>Clear</button>
        </div>
      )}

      {!data.data ? <div className="grid h-64 place-items-center"><Spinner className="h-7 w-7 text-brand-500" /></div> : (
        <div className="grid gap-4 overflow-x-auto pb-4 md:grid-cols-3 xl:grid-cols-5">
          {COLS.map((s) => (
            <div key={s} className="min-w-[260px] rounded-3xl bg-slate-100/80 p-3 dark:bg-slate-900/60">
              <div className="mb-3 flex items-center justify-between px-1">
                <StatusBadge status={s} />
                <span className="text-sm font-bold text-slate-500">{data.data[s].length}</span>
              </div>
              <div className="space-y-2.5">
                {data.data[s].map((o) => {
                  const overdue = o.delivery_at && dayjs(o.delivery_at).isBefore(dayjs())
                  const checked = sel.includes(o.id)
                  return (
                    <div key={o.id} className={cx('card p-3 transition', checked && 'ring-2 ring-brand-500')}>
                      <div className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={checked} onChange={() => setSel(checked ? sel.filter((x) => x !== o.id) : [...sel, o.id])} />
                        <Link to={`/orders/${o.id}`} className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-lg font-extrabold">#{o.queue_no}</span>
                            <StatusBadge status={o.payment_status} />
                          </div>
                          <p className="truncate text-xs text-slate-500">{o.order_no}</p>
                          <p className="truncate text-sm font-medium">{o.customer?.name ?? 'Walk-in'}</p>
                          <p className="text-xs text-slate-500">{qty(o.total_weight)} kg · {o.total_pieces} pcs · {money(o.total)}</p>
                          <p className={cx('mt-1 flex items-center gap-1 text-xs font-semibold', overdue ? 'text-rose-600' : 'text-slate-500')}>
                            {overdue && <AlertTriangle className="h-3 w-3" />}Due {o.delivery_at ? dayjs(o.delivery_at).format('DD MMM, hh:mm A') : '—'}
                          </p>
                        </Link>
                      </div>
                      {next(s) && (
                        <button disabled={busy} onClick={() => move([o.id], next(s))}
                          className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl bg-brand-50 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
                          {label(next(s))}<ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
                {!data.data[s].length && <p className="py-8 text-center text-xs text-slate-400">No orders</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
