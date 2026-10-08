import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, Download, HandCoins, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { AsyncButton, ErrorState, PageLoader, useConfirm } from '../components/feedback'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { exportExcel } from '../lib/exportExcel'
import { date, label, money } from '../lib/format'
import { Card, DateRange, Empty, Field, Input, Modal, PageHeader, Select, Stat } from '../components/ui'

export default function CustomerLedger() {
  const { id } = useParams()
  const { can, lookups } = useAuth()
  const [range, setRange] = useState({ from: '', to: '' })
  const q = useQuery({ queryKey: ['cust-ledger', id, range], queryFn: async () => (await api.get(`ledger/customers/${id}`, { params: range })).data })
  const [settle, setSettle] = useState<any>(null)
  const [adjust, setAdjust] = useState<any>(null)
  const confirm = useConfirm()

  if (!q.data) return q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <PageLoader stats={3} />
  const { customer: c, entries, open_orders, credit_available } = q.data

  const post = async (url: string, body: any, close: () => void) => {
    try { await api.post(url, body); toast.success('Saved'); close(); q.refetch() } catch (e) { toast.error(errorMessage(e)) }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={c.name} subtitle={`${c.code} · ${c.mobile}`} icon={<BookOpen className="h-5 w-5" />} actions={<>
        <Link to="/customers" className="btn-secondary"><ArrowLeft className="h-4 w-4" />Customers</Link>
        <button className="btn-secondary" onClick={() => exportExcel<any>(entries, [
          { header: 'Date', value: (r) => r.date }, { header: 'Type', value: (r) => label(r.type) }, { header: 'Reference', value: (r) => r.reference },
          { header: 'Description', value: (r) => r.description }, { header: 'Debit', value: (r) => r.debit }, { header: 'Credit', value: (r) => r.credit }, { header: 'Balance', value: (r) => r.balance },
        ], `ledger-${c.code}`)}><Download className="h-4 w-4" />Excel</button>
        {can('customers.update') && <button className="btn-secondary" onClick={() => setAdjust({ direction: 'credit', amount: '', description: '' })}><SlidersHorizontal className="h-4 w-4" />Adjust</button>}
        {can('orders.payment') && c.balance > 0 && <button className="btn-primary" onClick={() => setSettle({ method: 'cash', amount: String(c.balance) })}><HandCoins className="h-4 w-4" />Receive payment</button>}
      </>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Balance" value={money(c.balance)} tone={c.balance > 0 ? 'rose' : 'emerald'} />
        <Stat label="Credit limit" value={money(c.credit_limit)} tone="sky" />
        <Stat label="Credit available" value={money(credit_available)} tone="violet" />
      </div>
      {open_orders.length > 0 && (
        <Card title="Unpaid orders">
          <div className="flex flex-wrap gap-2">
            {open_orders.map((o: any) => <Link key={o.id} to={`/orders/${o.id}`} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm dark:border-rose-500/30 dark:bg-rose-500/10">
              <b>{o.order_no}</b> · {money(o.balance)}</Link>)}
          </div>
        </Card>
      )}
      <Card title="Ledger" padded={false} actions={<DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />}>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
            <tbody>{entries.map((e: any) => (
              <tr key={e.id}><td>{date(e.date)}</td><td>{label(e.type)}</td><td className="font-mono text-xs">{e.reference}</td><td>{e.description}</td>
                <td className="text-right">{e.debit ? money(e.debit) : ''}</td><td className="text-right text-emerald-600">{e.credit ? money(e.credit) : ''}</td>
                <td className="text-right font-semibold">{money(e.balance)}</td></tr>
            ))}</tbody>
          </table>
          {!entries.length && <Empty title="No ledger entries" />}
        </div>
      </Card>

      <Modal open={!!settle} onClose={() => setSettle(null)} title="Receive payment on account" size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setSettle(null)}>Cancel</button>
        <AsyncButton className="btn-success" onClick={() => post(`ledger/customers/${id}/settle`, settle, () => setSettle(null))}>Save</AsyncButton>
      </>}>
        {settle && <div className="space-y-4">
          <p className="text-sm text-slate-500">Allocated to the oldest unpaid orders first.</p>
          <Field label="Method"><Select value={settle.method} onChange={(e) => setSettle({ ...settle, method: e.target.value })} options={(lookups?.payment_methods ?? []).map((m) => ({ value: m, label: label(m) }))} /></Field>
          <Field label="Amount"><Input type="number" step="0.01" value={settle.amount} onChange={(e) => setSettle({ ...settle, amount: e.target.value })} /></Field>
          <Field label="Reference"><Input value={settle.reference ?? ''} onChange={(e) => setSettle({ ...settle, reference: e.target.value })} /></Field>
          {settle.method === 'cheque' && <Field label="Cheque no"><Input value={settle.cheque_no ?? ''} onChange={(e) => setSettle({ ...settle, cheque_no: e.target.value })} /></Field>}
        </div>}
      </Modal>
      <Modal open={!!adjust} onClose={() => setAdjust(null)} title="Ledger adjustment" size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setAdjust(null)}>Cancel</button>
        <AsyncButton onClick={async () => {
          if (await confirm({ title: 'Post ledger adjustment?', message: `${adjust.direction === 'credit' ? 'Reduce' : 'Increase'} the balance by ${money(adjust.amount)}. Adjustments are permanent and audited.`, confirmText: 'Post adjustment' })) await post(`ledger/customers/${id}/adjust`, adjust, () => setAdjust(null))
        }}>Post</AsyncButton>
      </>}>
        {adjust && <div className="space-y-4">
          <Field label="Direction"><Select value={adjust.direction} onChange={(e) => setAdjust({ ...adjust, direction: e.target.value })}
            options={[{ value: 'credit', label: 'Credit (reduce balance / write-off)' }, { value: 'debit', label: 'Debit (increase balance)' }]} /></Field>
          <Field label="Amount"><Input type="number" step="0.01" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} /></Field>
          <Field label="Description"><Input value={adjust.description} onChange={(e) => setAdjust({ ...adjust, description: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  )
}
