import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, BookOpen, Download, Landmark, Scale } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { exportExcel } from '../../lib/exportExcel'
import { date, label, money, monthStart, today } from '../../lib/format'
import { Card, DateRange, Empty, PageHeader, Select, Stat, cx } from '../../components/ui'
import { ErrorState, PageLoader } from '../../components/feedback'

export default function CashBook() {
  const { branchId } = useAuth()
  const [f, setF] = useState({ from: monthStart(), to: today(), method: '', source: '' })
  const q = useQuery({ queryKey: ['cash-book', f, branchId], queryFn: async () => (await api.get('cash-book', { params: { ...f, branch_id: branchId || undefined } })).data })
  const d = q.data
  return (
    <div>
      <PageHeader title="Cash Book" subtitle="All money in and out, with running balance" icon={<BookOpen className="h-5 w-5" />} actions={<>
        <Select className="w-auto" placeholder="All methods" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} options={['cash', 'card', 'bank_transfer', 'cheque'].map((m) => ({ value: m, label: label(m) }))} />
        <Select className="w-auto" placeholder="All sources" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} options={['sale', 'refund', 'income', 'expense', 'supplier_payment', 'plan'].map((m) => ({ value: m, label: label(m) }))} />
        <DateRange from={f.from} to={f.to} onChange={(from, to) => setF({ ...f, from, to })} />
        {d && <button className="btn-secondary" onClick={() => exportExcel<any>(d.entries, [
          { header: 'Date', value: (e) => e.date }, { header: 'Source', value: (e) => label(e.source) }, { header: 'Reference', value: (e) => e.reference },
          { header: 'Description', value: (e) => e.description }, { header: 'Method', value: (e) => label(e.method) },
          { header: 'In', value: (e) => (e.direction === 'in' ? e.amount : '') }, { header: 'Out', value: (e) => (e.direction === 'out' ? e.amount : '') }, { header: 'Balance', value: (e) => e.running_balance },
        ], 'cash-book')}><Download className="h-4 w-4" />Excel</button>}
      </>} />
      {!d ? (q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <PageLoader header={false} stats={4} />) : <>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Opening balance" value={money(d.opening_balance)} icon={<Landmark className="h-5 w-5" />} />
          <Stat label="Money in" value={money(d.total_in)} tone="emerald" icon={<ArrowDownLeft className="h-5 w-5" />} />
          <Stat label="Money out" value={money(d.total_out)} tone="rose" icon={<ArrowUpRight className="h-5 w-5" />} />
          <Stat label="Closing balance" value={money(d.closing_balance)} tone="violet" icon={<Scale className="h-5 w-5" />} />
        </div>
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Date</th><th>Source</th><th>Reference</th><th>Description</th><th>Method</th><th>Branch</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                <tr className="bg-slate-50/60 dark:bg-slate-800/30"><td colSpan={8} className="font-semibold">Opening balance</td><td className="text-right font-bold">{money(d.opening_balance)}</td></tr>
                {d.entries.map((e: any) => (
                  <tr key={e.id}><td>{date(e.date)}</td><td>{label(e.source)}</td><td className="font-mono text-xs">{e.reference}</td><td className="max-w-xs truncate">{e.description}</td>
                    <td>{label(e.method)}</td><td>{e.branch?.name}</td>
                    <td className="text-right text-emerald-600">{e.direction === 'in' ? money(e.amount) : ''}</td>
                    <td className="text-right text-rose-600">{e.direction === 'out' ? money(e.amount) : ''}</td>
                    <td className={cx('text-right font-semibold', e.running_balance < 0 && 'text-rose-600')}>{money(e.running_balance)}</td></tr>
                ))}
              </tbody>
            </table>
            {!d.entries.length && <Empty title="No entries in this period" />}
          </div>
        </Card>
      </>}
    </div>
  )
}
