import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, Shirt } from 'lucide-react'
import { api } from '../lib/api'
import { ORDER_FLOW, dateTime, label, money, qty, setCurrency } from '../lib/format'
import { Empty, Spinner, StatusBadge, cx } from '../components/ui'

/** Public e-bill (module 45) — reachable only with the secret token from the SMS link. */
export default function Ebill() {
  const { token } = useParams()
  const q = useQuery({
    queryKey: ['ebill', token],
    queryFn: async () => {
      const { data } = await api.get(`public/ebill/${token}`)
      setCurrency(data.business.currency)
      return data
    },
    retry: false,
  })
  if (q.isLoading) return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8 text-brand-500" /></div>
  if (q.isError || !q.data) return <div className="grid min-h-screen place-items-center"><Empty title="Bill not found" text="This link is invalid or has expired." /></div>
  const { order, items, business, branch, customer } = q.data
  const step = ORDER_FLOW.indexOf(order.status)

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-cyan-50 px-4 py-10 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-lg">
        <div className="card slide-up overflow-hidden">
          <div className="bg-gradient-to-br from-brand-600 to-accent-500 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><Shirt className="h-5 w-5" /></div>
              <div>
                <p className="text-lg font-extrabold">{business.business_name}</p>
                <p className="text-xs text-white/80">{branch?.name} · {branch?.phone}</p>
              </div>
            </div>
            <div className="mt-6 flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-white/70">Order</p>
                <p className="text-xl font-bold">{order.order_no}</p>
                <p className="text-xs text-white/80">{dateTime(order.created_at)}</p>
              </div>
              <div className="rounded-2xl bg-white/15 px-4 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wider text-white/70">Queue</p>
                <p className="text-2xl font-extrabold">#{order.queue_no}</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {order.status !== 'cancelled' ? (
              <div className="mb-6 flex items-center justify-between">
                {ORDER_FLOW.map((s, i) => (
                  <div key={s} className="flex flex-1 flex-col items-center gap-1 text-center">
                    <div className={cx('grid h-8 w-8 place-items-center rounded-full text-xs font-bold', i <= step ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800')}>
                      {i <= step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className={cx('text-[10px] font-semibold', i <= step ? 'text-emerald-600' : 'text-slate-400')}>{label(s)}</span>
                  </div>
                ))}
              </div>
            ) : <div className="mb-4"><StatusBadge status="cancelled" /></div>}

            {customer && <p className="mb-4 text-sm text-slate-500">Customer: <b className="text-slate-800 dark:text-slate-200">{customer.name}</b> ({customer.mobile})</p>}

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{it.description}</p>
                    <p className="text-xs text-slate-500">{it.pricing_type === 'weight_range' ? `${qty(it.weight)} kg` : `${qty(it.quantity)} pcs`} × {money(it.unit_price)}</p>
                  </div>
                  <p className="font-semibold tabular-nums">{money(it.total)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1.5 border-t border-dashed border-slate-200 pt-4 text-sm dark:border-slate-700">
              <Row k="Subtotal" v={money(order.subtotal)} />
              {order.discount > 0 && <Row k="Discount" v={`- ${money(order.discount)}`} />}
              {order.service_charge > 0 && <Row k="Service charge" v={money(order.service_charge)} />}
              {order.tax > 0 && <Row k="Tax" v={money(order.tax)} />}
              <Row k="Total" v={money(order.total)} bold />
              <Row k="Paid" v={money(order.paid)} />
              <Row k="Balance" v={money(order.balance)} bold />
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <Clock className="h-4 w-4" />{order.delivery_type === 'home_delivery' ? 'Delivery' : 'Ready for pickup'}: {dateTime(order.delivery_at)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
  <div className={cx('flex justify-between', bold && 'text-base font-bold')}><span className="text-slate-500">{k}</span><span className="tabular-nums">{v}</span></div>
)
