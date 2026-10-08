import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  ArrowLeft, Ban, Check, CheckCircle2, Copy, HandCoins, History, MessageSquare, Pencil, Printer, RotateCcw, Tag, Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { AsyncButton, ErrorState, PageLoader, useConfirm } from '../components/feedback'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ORDER_FLOW, dateTime, label, money, qty } from '../lib/format'
import { printReceipt, printTags } from '../lib/print'
import { Card, Empty, Field, Input, Modal, Select, Spinner, StatusBadge, Textarea, cx } from '../components/ui'

export default function OrderDetail() {
  const { id } = useParams()
  const { can, lookups } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['order', id], queryFn: async () => (await api.get(`orders/${id}`)).data })
  const o = q.data

  const [payOpen, setPayOpen] = useState(false)
  const [pay, setPay] = useState<any>({ method: 'cash', amount: '' })
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [retOpen, setRetOpen] = useState(false)
  const [ret, setRet] = useState<{ method: string; reason: string; qty: Record<number, string> }>({ method: 'cash', reason: '', qty: {} })
  const [editOpen, setEditOpen] = useState(false)
  const [edit, setEdit] = useState<any>({})
  const [cmpOpen, setCmpOpen] = useState(false)
  const [cmp, setCmp] = useState({ type: 'rewash', description: '' })

  const refresh = (data?: any) => {
    if (data) qc.setQueryData(['order', id], data)
    else q.refetch()
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['shift-current'] })
  }
  const run = (fn: () => Promise<any>, msg: string) => async () => {
    try {
      const { data } = await fn()
      refresh(data?.order_no ? data : undefined)
      toast.success(msg)
      return true
    } catch (e) {
      toast.error(errorMessage(e))
      return false
    }
  }

  const status = useMutation({
    mutationFn: (s: string) => api.post(`orders/${id}/status`, { status: s }),
    onSuccess: ({ data }) => { refresh(data); toast.success(`Status → ${label(data.status)}`) },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const confirm = useConfirm()
  const changeStatus = async (s: string) => {
    if (s === 'delivered') {
      const ok = await confirm({
        title: 'Mark as delivered?', danger: false, confirmText: 'Mark delivered',
        message: o?.balance > 0 ? `This order still has a balance of ${money(o.balance)}. It can only be delivered on credit if the customer's limit allows.` : 'The order will be closed and the customer notified.',
      })
      if (!ok) return
    }
    status.mutate(s)
  }

  if (!o) return q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <PageLoader />

  const step = ORDER_FLOW.indexOf(o.status)
  const closed = ['delivered', 'cancelled'].includes(o.status)
  const settings = lookups?.settings

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/orders" className="btn-icon"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-lg shadow-brand-500/30">
            <div className="text-center leading-none"><p className="text-[9px] font-bold uppercase opacity-80">Queue</p><p className="text-xl font-extrabold">{o.queue_no}</p></div>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{o.order_no}</h1>
            <p className="text-sm text-slate-500">{o.receipt_no} · {dateTime(o.created_at)} · {o.branch?.name} · by {o.user?.name}</p>
            <div className="mt-1 flex gap-2"><StatusBadge status={o.status} /><StatusBadge status={o.payment_status} /></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => settings && printReceipt(o, settings, { reprint: true })}><Printer className="h-4 w-4" />Reprint</button>
          <button className="btn-secondary" onClick={() => settings && printTags(o, settings)}><Tag className="h-4 w-4" />Tags</button>
          <button className="btn-secondary" onClick={() => { navigator.clipboard?.writeText(o.ebill_url); toast.success('E-bill link copied') }}><Copy className="h-4 w-4" />E-bill</button>
          {can('sms.send') && o.customer && (
            <select className="input w-auto py-2 text-sm font-semibold" value="" onChange={async (e) => {
              const type = e.target.value
              if (!type) return
              try { await api.post(`orders/${id}/sms`, { type }); toast.success('SMS sent') } catch (err) { toast.error(errorMessage(err)) }
            }}>
              <option value="">✉ Send SMS…</option>
              <option value="ebill">E-bill link</option><option value="order_ready">Order ready</option>
              <option value="delivered">Delivered</option><option value="payment_reminder">Payment reminder</option>
            </select>
          )}
        </div>
      </div>

      {/* Status tracker */}
      {o.status !== 'cancelled' && (
        <Card>
          <div className="flex items-center">
            {ORDER_FLOW.map((s, i) => (
              <div key={s} className="flex flex-1 items-center">
                <button disabled={closed || !can('orders.status') || i === step || status.isPending} onClick={() => changeStatus(s)}
                  className={cx('group flex flex-col items-center gap-1.5', !closed && can('orders.status') && i !== step && 'cursor-pointer')}>
                  <span className={cx('grid h-10 w-10 place-items-center rounded-full border-2 text-sm font-bold transition',
                    i < step && 'border-emerald-500 bg-emerald-500 text-white', i === step && 'border-brand-600 bg-brand-600 text-white ring-4 ring-brand-500/20',
                    i > step && 'border-slate-200 text-slate-400 group-hover:border-brand-400 dark:border-slate-700')}>
                    {i < step ? <Check className="h-5 w-5" /> : i + 1}
                  </span>
                  <span className={cx('text-xs font-semibold', i <= step ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400')}>{label(s)}</span>
                </button>
                {i < ORDER_FLOW.length - 1 && <div className={cx('mx-1 h-0.5 flex-1 rounded', i < step ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700')} />}
              </div>
            ))}
          </div>
          {!closed && can('orders.status') && step < ORDER_FLOW.length - 1 && (
            <div className="mt-5 flex justify-center">
              <button className="btn-primary" disabled={status.isPending} onClick={() => changeStatus(ORDER_FLOW[step + 1])}>
                {status.isPending ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}Mark as {label(ORDER_FLOW[step + 1])}
              </button>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Items" padded={false} actions={can('orders.update') && !closed && (
            <button className="btn-ghost btn-sm" onClick={() => {
              setEdit({ delivery_type: o.delivery_type, delivery_address: o.delivery_address ?? '', delivery_at: o.delivery_at ? dayjs(o.delivery_at).format('YYYY-MM-DDTHH:mm') : '',
                notes: o.notes ?? '', item_notes: Object.fromEntries(o.items.map((i: any) => [i.id, i.notes ?? ''])) })
              setEditOpen(true)
            }}><Pencil className="h-3.5 w-3.5" />Edit details</button>
          )}>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Item</th><th>Tag</th><th className="text-right">Qty / Weight</th><th className="text-right">Rate</th><th className="text-right">Total</th></tr></thead>
                <tbody>
                  {o.items.map((it: any) => (
                    <tr key={it.id}>
                      <td><p className="font-medium">{it.description}</p>{it.notes && <p className="text-xs italic text-amber-600">↳ {it.notes}</p>}
                        {it.returned_qty > 0 && <p className="text-xs text-rose-600">Returned {qty(it.returned_qty)}</p>}</td>
                      <td className="font-mono text-xs">{it.tag_code}</td>
                      <td className="text-right">{it.pricing_type === 'weight_range' ? `${qty(it.weight)} kg (${qty(it.quantity)} pcs)` : `${qty(it.quantity)} pcs`}</td>
                      <td className="text-right">{money(it.unit_price)}</td>
                      <td className="text-right font-semibold">{money(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 border-t border-slate-100 p-5 dark:border-slate-800 sm:grid-cols-2">
              <div className="space-y-1 text-sm">
                <p><span className="text-slate-500">Delivery:</span> <b>{label(o.delivery_type)}</b> · {dateTime(o.delivery_at)}</p>
                {o.delivery_address && <p><span className="text-slate-500">Address:</span> {o.delivery_address}</p>}
                {o.delivered_at && <p><span className="text-slate-500">Delivered:</span> {dateTime(o.delivered_at)}</p>}
                <p><span className="text-slate-500">Load:</span> {qty(o.total_weight)} kg · {o.total_pieces} pcs</p>
                {o.promotion && <p><span className="text-slate-500">Promotion:</span> {o.promotion.name}</p>}
                {o.notes && <p className="rounded-xl bg-amber-50 p-2 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">📝 {o.notes}</p>}
              </div>
              <div className="space-y-1.5 text-sm">
                <Row k="Subtotal" v={money(o.subtotal)} />
                {o.discount > 0 && <Row k="Discount" v={`- ${money(o.discount)}`} />}
                {o.service_charge > 0 && <Row k="Service charge" v={money(o.service_charge)} />}
                {o.tax > 0 && <Row k="Tax" v={money(o.tax)} />}
                <Row k="Total" v={money(o.total)} bold />
                {o.returned > 0 && <Row k="Returned" v={`- ${money(o.returned)}`} />}
                <Row k="Paid" v={money(o.paid)} />
                <Row k="Balance" v={money(o.balance)} bold tone={o.balance > 0 ? 'text-rose-600' : 'text-emerald-600'} />
              </div>
            </div>
          </Card>

          <Card title="Payments" padded={false} actions={can('orders.payment') && o.balance > 0 && o.status !== 'cancelled' && (
            <button className="btn-primary btn-sm" onClick={() => { setPay({ method: 'cash', amount: String(o.balance) }); setPayOpen(true) }}><HandCoins className="h-3.5 w-3.5" />Receive payment</button>
          )}>
            {o.payments.length ? (
              <table className="table-base">
                <thead><tr><th>Payment</th><th>Date</th><th>Method</th><th>Reference</th><th>By</th><th className="text-right">Amount</th></tr></thead>
                <tbody>{o.payments.map((p: any) => (
                  <tr key={p.id}><td className="font-mono text-xs">{p.payment_no}{p.is_advance && <span className="chip ml-1 bg-sky-100 text-sky-700">Advance</span>}</td>
                    <td className="text-xs">{dateTime(p.created_at)}</td><td>{label(p.method)}</td>
                    <td className="text-xs">{[p.reference, p.bank, p.cheque_no].filter(Boolean).join(' · ') || '—'}</td><td>{p.user?.name}</td>
                    <td className="text-right font-semibold">{money(p.amount)}</td></tr>
                ))}</tbody>
              </table>
            ) : <Empty title="No payments yet" />}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Customer">
            {o.customer ? (
              <div className="space-y-1 text-sm">
                <p className="text-base font-bold">{o.customer.name}</p>
                <p>{o.customer.mobile}</p>
                {o.customer.address && <p className="text-slate-500">{o.customer.address}</p>}
                <p className="pt-2">Account balance: <b className={o.customer.balance > 0 ? 'text-rose-600' : ''}>{money(o.customer.balance)}</b></p>
                {can('customers.ledger') && <Link to={`/customers/${o.customer.id}/ledger`} className="btn-secondary btn-sm mt-2">View ledger</Link>}
              </div>
            ) : <p className="text-sm text-slate-500">Walk-in customer</p>}
          </Card>

          <Card title="Actions">
            <div className="grid gap-2">
              {can('complaints.create') && <button className="btn-secondary justify-start" onClick={() => setCmpOpen(true)}><RotateCcw className="h-4 w-4" />Re-wash / complaint</button>}
              {can('sales_returns.create') && o.status !== 'cancelled' && (
                <button className="btn-secondary justify-start" onClick={() => { setRet({ method: 'cash', reason: '', qty: {} }); setRetOpen(true) }}><Undo2 className="h-4 w-4" />Sales return</button>
              )}
              {can('orders.cancel') && !closed && <button className="btn-secondary justify-start text-rose-600" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" />Cancel order</button>}
            </div>
          </Card>

          <Card title={<span className="flex items-center gap-2"><History className="h-4 w-4" />Timeline</span>}>
            <ol className="relative space-y-4 border-l-2 border-slate-100 pl-5 dark:border-slate-800">
              {o.histories.map((h: any) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500 dark:border-slate-900" />
                  <div className="flex items-center gap-2"><StatusBadge status={h.status} /><span className="text-xs text-slate-500">{dateTime(h.created_at)}</span></div>
                  <p className="mt-1 text-sm">{h.note ?? '—'} <span className="text-xs text-slate-400">· {h.user?.name}</span></p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Receive payment" size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setPayOpen(false)}>Cancel</button>
        <AsyncButton className="btn-success" onClick={async () => (await run(() => api.post(`orders/${id}/payments`, pay), 'Payment recorded')()) && setPayOpen(false)}>Save payment</AsyncButton>
      </>}>
        <div className="space-y-4">
          <p className="text-sm">Balance due: <b>{money(o.balance)}</b></p>
          <Field label="Method"><Select value={pay.method} options={(lookups?.payment_methods ?? []).map((m) => ({ value: m, label: label(m) }))} onChange={(e) => setPay({ ...pay, method: e.target.value })} /></Field>
          <Field label="Amount"><Input type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          {pay.method !== 'cash' && <Field label="Reference"><Input value={pay.reference ?? ''} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>}
          {pay.method === 'cheque' && <div className="grid grid-cols-2 gap-3">
            <Field label="Cheque no"><Input value={pay.cheque_no ?? ''} onChange={(e) => setPay({ ...pay, cheque_no: e.target.value })} /></Field>
            <Field label="Cheque date"><Input type="date" value={pay.cheque_date ?? ''} onChange={(e) => setPay({ ...pay, cheque_date: e.target.value })} /></Field>
          </div>}
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order?" size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setCancelOpen(false)}>Keep order</button>
        <AsyncButton className="btn-danger" disabled={!reason.trim()} onClick={async () => (await run(() => api.post(`orders/${id}/cancel`, { reason }), 'Order cancelled')()) && setCancelOpen(false)}>Cancel order</AsyncButton>
      </>}>
        <p className="text-sm text-slate-600 dark:text-slate-300">{o.paid > 0 ? `${money(o.paid)} already paid will be refunded in cash from the current shift.` : 'The order will be voided.'} This cannot be undone.</p>
        <Field label="Reason *" className="mt-4"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>

      <Modal open={retOpen} onClose={() => setRetOpen(false)} title="Sales return" size="lg" footer={<>
        <button className="btn-secondary" onClick={() => setRetOpen(false)}>Cancel</button>
        <AsyncButton className="btn-danger" onClick={async () => {
          const items = Object.entries(ret.qty).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ order_item_id: Number(k), quantity: Number(v) }))
          if (!items.length) return toast.warning('Enter a quantity to return')
          if (!(await confirm({ title: 'Process this return?', message: `${items.length} line(s) will be returned and refunded by ${label(ret.method)}. This cannot be undone.`, confirmText: 'Process return' }))) return
          if (await run(() => api.post('sales-returns', { order_id: o.id, refund_method: ret.method, reason: ret.reason, items }), 'Return recorded')()) setRetOpen(false)
        }}>Process return</AsyncButton>
      </>}>
        <table className="table-base mb-4">
          <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Returnable</th><th className="text-right">Return qty</th></tr></thead>
          <tbody>{o.items.map((it: any) => (
            <tr key={it.id}><td>{it.description}</td><td className="text-right">{qty(it.quantity)}</td><td className="text-right">{qty(it.quantity - it.returned_qty)}</td>
              <td className="text-right"><input type="number" min="0" max={it.quantity - it.returned_qty} step="1" className="input ml-auto w-24 py-1.5"
                value={ret.qty[it.id] ?? ''} onChange={(e) => setRet({ ...ret, qty: { ...ret.qty, [it.id]: e.target.value } })} /></td></tr>
          ))}</tbody>
        </table>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Refund method"><Select value={ret.method} onChange={(e) => setRet({ ...ret, method: e.target.value })}
            options={[{ value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'credit_note', label: 'Credit note (account)' }]} /></Field>
          <Field label="Reason"><Input value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit order details" size="lg" footer={<>
        <button className="btn-secondary" onClick={() => setEditOpen(false)}>Cancel</button>
        <AsyncButton onClick={async () => (await run(() => api.put(`orders/${id}`, { ...edit, delivery_at: edit.delivery_at ? dayjs(edit.delivery_at).format('YYYY-MM-DD HH:mm:ss') : null }), 'Order updated')()) && setEditOpen(false)}>Save</AsyncButton>
      </>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery type"><Select value={edit.delivery_type} onChange={(e) => setEdit({ ...edit, delivery_type: e.target.value })} options={[{ value: 'pickup', label: 'Pickup' }, { value: 'home_delivery', label: 'Home delivery' }]} /></Field>
          <Field label="Delivery date & time"><Input type="datetime-local" value={edit.delivery_at ?? ''} onChange={(e) => setEdit({ ...edit, delivery_at: e.target.value })} /></Field>
          <Field label="Delivery address" className="sm:col-span-2"><Input value={edit.delivery_address ?? ''} onChange={(e) => setEdit({ ...edit, delivery_address: e.target.value })} /></Field>
          <Field label="Order notes" className="sm:col-span-2"><Textarea value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          {o.items.map((it: any) => (
            <Field key={it.id} label={`Note · ${it.description}`} className="sm:col-span-2">
              <Input value={edit.item_notes?.[it.id] ?? ''} onChange={(e) => setEdit({ ...edit, item_notes: { ...edit.item_notes, [it.id]: e.target.value } })} />
            </Field>
          ))}
        </div>
      </Modal>

      <Modal open={cmpOpen} onClose={() => setCmpOpen(false)} title="Re-wash / complaint" size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setCmpOpen(false)}>Cancel</button>
        <AsyncButton disabled={!cmp.description} icon={<MessageSquare className="h-4 w-4" />} onClick={async () => {
          try { await api.post('complaints', { ...cmp, order_id: o.id }); toast.success('Recorded'); setCmpOpen(false); q.refetch() } catch (e) { toast.error(errorMessage(e)) }
        }}>Save</AsyncButton>
      </>}>
        <div className="space-y-4">
          <Field label="Type"><Select value={cmp.type} onChange={(e) => setCmp({ ...cmp, type: e.target.value })} options={[{ value: 'rewash', label: 'Re-wash' }, { value: 'complaint', label: 'Complaint' }]} /></Field>
          <Field label="Description"><Textarea value={cmp.description} onChange={(e) => setCmp({ ...cmp, description: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  )
}

const Row = ({ k, v, bold, tone }: { k: string; v: string; bold?: boolean; tone?: string }) => (
  <div className={cx('flex justify-between', bold && 'text-base font-bold')}><span className="text-slate-500">{k}</span><span className={cx('tabular-nums', tone)}>{v}</span></div>
)
