import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, Truck } from 'lucide-react'
import { ErrorState, PageLoader } from '../components/feedback'
import { api } from '../lib/api'
import { exportExcel } from '../lib/exportExcel'
import { date, label, money } from '../lib/format'
import { Card, Empty, PageHeader, Stat } from '../components/ui'

export default function SupplierLedger() {
  const { id } = useParams()
  const q = useQuery({ queryKey: ['sup-ledger', id], queryFn: async () => (await api.get(`ledger/suppliers/${id}`)).data })
  if (!q.data) return q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <PageLoader stats={2} />
  const { supplier: s, entries, open_grns } = q.data
  return (
    <div className="space-y-6">
      <PageHeader title={s.name} subtitle={`${s.code} · Supplier ledger`} icon={<Truck className="h-5 w-5" />} actions={<>
        <Link to="/suppliers" className="btn-secondary"><ArrowLeft className="h-4 w-4" />Suppliers</Link>
        <button className="btn-secondary" onClick={() => exportExcel<any>(entries, [
          { header: 'Date', value: (r) => r.date }, { header: 'Type', value: (r) => label(r.type) }, { header: 'Reference', value: (r) => r.reference },
          { header: 'Debit', value: (r) => r.debit }, { header: 'Credit', value: (r) => r.credit }, { header: 'Balance', value: (r) => r.balance },
        ], `supplier-${s.code}`)}><Download className="h-4 w-4" />Excel</button>
        <Link to="/supplier-payments" className="btn-primary">Pay supplier</Link>
      </>} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Payable balance" value={money(s.balance)} tone={s.balance > 0 ? 'rose' : 'emerald'} />
        <Stat label="Unpaid GRNs" value={open_grns.length} tone="amber" sub={money(open_grns.reduce((a: number, g: any) => a + g.total - g.paid, 0))} />
      </div>
      <Card title="Ledger" padded={false}>
        <table className="table-base">
          <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th className="text-right">Debit (paid)</th><th className="text-right">Credit (owed)</th><th className="text-right">Balance</th></tr></thead>
          <tbody>{entries.map((e: any) => (
            <tr key={e.id}><td>{date(e.date)}</td><td>{label(e.type)}</td><td className="font-mono text-xs">{e.reference}</td><td>{e.description}</td>
              <td className="text-right text-emerald-600">{e.debit ? money(e.debit) : ''}</td><td className="text-right">{e.credit ? money(e.credit) : ''}</td><td className="text-right font-semibold">{money(e.balance)}</td></tr>
          ))}</tbody>
        </table>
        {!entries.length && <Empty title="No entries" />}
      </Card>
    </div>
  )
}
