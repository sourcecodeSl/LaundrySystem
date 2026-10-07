import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Download, Printer } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { exportExcel } from '../lib/exportExcel'
import { label, money, monthStart, qty, today } from '../lib/format'
import { esc, printHtml } from '../lib/print'
import { Card, DateRange, Empty, PageHeader, Spinner, cx } from '../components/ui'

type Col = { key: string; header: string; kind?: 'money' | 'qty' | 'int' | 'text' }
const REPORTS: { id: string; title: string; perm?: string; cols: Col[] }[] = [
  { id: 'sales-by-service', title: 'Sales by service', cols: [{ key: 'service', header: 'Service' }, { key: 'orders', header: 'Orders', kind: 'int' }, { key: 'pieces', header: 'Pieces', kind: 'qty' }, { key: 'weight', header: 'Weight (kg)', kind: 'qty' }, { key: 'amount', header: 'Amount', kind: 'money' }] },
  { id: 'sales-by-branch', title: 'Sales by branch', cols: [{ key: 'branch', header: 'Branch' }, { key: 'orders', header: 'Orders', kind: 'int' }, { key: 'gross', header: 'Gross', kind: 'money' }, { key: 'discount', header: 'Discount', kind: 'money' }, { key: 'tax', header: 'Tax', kind: 'money' }, { key: 'total', header: 'Total', kind: 'money' }, { key: 'returned', header: 'Returns', kind: 'money' }, { key: 'collected', header: 'Collected', kind: 'money' }, { key: 'outstanding', header: 'Outstanding', kind: 'money' }] },
  { id: 'sales-by-cashier', title: 'Sales by cashier', cols: [{ key: 'cashier', header: 'Cashier' }, { key: 'orders', header: 'Orders', kind: 'int' }, { key: 'total', header: 'Total', kind: 'money' }, { key: 'collected', header: 'Collected', kind: 'money' }, { key: 'discount', header: 'Discounts', kind: 'money' }, { key: 'avg_order', header: 'Avg order', kind: 'money' }] },
  { id: 'daily-sales', title: 'Daily sales', cols: [{ key: 'date', header: 'Date' }, { key: 'orders', header: 'Orders', kind: 'int' }, { key: 'weight', header: 'Weight', kind: 'qty' }, { key: 'pieces', header: 'Pieces', kind: 'int' }, { key: 'total', header: 'Total', kind: 'money' }, { key: 'collected', header: 'Collected', kind: 'money' }, { key: 'outstanding', header: 'Outstanding', kind: 'money' }] },
  { id: 'outstanding', title: 'Outstanding orders', cols: [{ key: 'order_no', header: 'Order' }, { key: 'date', header: 'Date' }, { key: 'customer', header: 'Customer' }, { key: 'mobile', header: 'Mobile' }, { key: 'branch', header: 'Branch' }, { key: 'status', header: 'Status' }, { key: 'age_days', header: 'Age (days)', kind: 'int' }, { key: 'total', header: 'Total', kind: 'money' }, { key: 'paid', header: 'Paid', kind: 'money' }, { key: 'balance', header: 'Balance', kind: 'money' }] },
  { id: 'customer-balances', title: 'Customer balances', cols: [{ key: 'code', header: 'Code' }, { key: 'name', header: 'Customer' }, { key: 'mobile', header: 'Mobile' }, { key: 'credit_limit', header: 'Credit limit', kind: 'money' }, { key: 'balance', header: 'Balance', kind: 'money' }] },
  { id: 'payments', title: 'Collections & payments', cols: [{ key: 'source', header: 'Source' }, { key: 'method', header: 'Method' }, { key: 'direction', header: 'In/Out' }, { key: 'entries', header: 'Entries', kind: 'int' }, { key: 'amount', header: 'Amount', kind: 'money' }] },
  { id: 'profit', title: 'Profit & loss', perm: 'reports.profit', cols: [{ key: 'label', header: 'Line' }, { key: 'amount', header: 'Amount', kind: 'money' }] },
]

const fmt = (v: any, kind?: Col['kind']) => kind === 'money' ? money(v) : kind === 'qty' ? qty(v) : kind === 'int' ? Number(v ?? 0) : typeof v === 'string' && /^[a-z_]+$/.test(v) ? label(v) : v ?? '—'

export default function Reports() {
  const { can, branchId, lookups } = useAuth()
  const available = REPORTS.filter((r) => !r.perm || can(r.perm))
  const [active, setActive] = useState(available[0].id)
  const [range, setRange] = useState({ from: monthStart(), to: today() })
  const rep = available.find((r) => r.id === active)!
  const q = useQuery({ queryKey: ['report', active, range, branchId], queryFn: async () => (await api.get(`reports/${active}`, { params: { ...range, branch_id: branchId || undefined } })).data })
  const rows: any[] = q.data?.rows ?? []
  const totals = Object.fromEntries(rep.cols.filter((c) => c.kind === 'money' || c.kind === 'int' || c.kind === 'qty').map((c) => [c.key, rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0)]))
  const showTotals = active !== 'profit' && rows.length > 0

  const print = () => printHtml(`<h2>${esc(lookups?.settings.general.business_name)} — ${esc(rep.title)}</h2><p>${esc(range.from)} to ${esc(range.to)}</p>
    <table><thead><tr>${rep.cols.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((r) => `<tr>${rep.cols.map((c) => `<td class="${c.kind ? 'r' : ''}">${esc(fmt(r[c.key], c.kind))}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
  `@page{size:A4 landscape;margin:12mm}body{font-size:11px}table{width:100%;border-collapse:collapse}th{background:#eef2ff;text-align:left}th,td{padding:5px;border-bottom:1px solid #ddd}.r{text-align:right}`)

  return (
    <div>
      <PageHeader title="Reports" subtitle={branchId ? 'Selected branch' : 'All branches'} icon={<BarChart3 className="h-5 w-5" />} actions={<>
        <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <button className="btn-secondary" onClick={print} disabled={!rows.length}><Printer className="h-4 w-4" />Print</button>
        <button className="btn-primary" disabled={!rows.length} onClick={() => exportExcel(rows, rep.cols.map((c) => ({ header: c.header, value: (r: any) => r[c.key] })), active, rep.title)}><Download className="h-4 w-4" />Excel</button>
      </>} />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card padded={false} className="h-fit p-2">
          {available.map((r) => (
            <button key={r.id} onClick={() => setActive(r.id)} className={cx('block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition',
              active === r.id ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800')}>{r.title}</button>
          ))}
        </Card>
        <Card title={rep.title} padded={false}>
          {q.isFetching && !q.data ? <div className="p-10 text-center"><Spinner className="mx-auto h-6 w-6" /></div> : !rows.length ? <Empty title="No data for this period" /> : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr>{rep.cols.map((c) => <th key={c.key} className={c.kind ? 'text-right' : ''}>{c.header}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} className={cx(r.kind === 'subtotal' && 'bg-slate-50 font-semibold dark:bg-slate-800/40', r.kind === 'total' && 'bg-brand-50 text-base font-extrabold dark:bg-brand-500/10')}>
                    {rep.cols.map((c) => <td key={c.key} className={cx(c.kind && 'text-right tabular-nums', c.kind === 'money' && Number(r[c.key]) < 0 && 'text-rose-600')}>{fmt(r[c.key], c.kind)}</td>)}
                  </tr>
                ))}</tbody>
                {showTotals && <tfoot><tr className="font-bold">{rep.cols.map((c, i) => <td key={c.key} className={cx('border-t-2 border-slate-200 dark:border-slate-700', c.kind && 'text-right')}>
                  {i === 0 ? 'Total' : c.key in totals && !['avg_order', 'age_days', 'credit_limit'].includes(c.key) ? fmt(totals[c.key], c.kind) : ''}</td>)}</tr></tfoot>}
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
