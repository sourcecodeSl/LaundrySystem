import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ClipboardList, Download, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type Paginated } from '../lib/api'
import { useAuth } from '../lib/auth'
import { exportExcel } from '../lib/exportExcel'
import { dateTime, label, money } from '../lib/format'
import { DataTable } from '../components/DataTable'
import { Card, DateRange, PageHeader, Pagination, SearchInput, Select, Spinner, StatusBadge } from '../components/ui'

export default function Orders() {
  const { branchId, can, lookups } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ q: '', status: '', payment_status: '', delivery_type: '', from: '', to: '', due_today: sp.get('due_today') ?? '' })
  const [exporting, setExporting] = useState(false)
  const params = { ...f, page, branch_id: branchId || undefined }
  const set = (k: string, v: string) => { setF((s) => ({ ...s, [k]: v })); setPage(1) }

  const q = useQuery({ queryKey: ['orders', params], queryFn: async () => (await api.get<Paginated<any>>('orders', { params })).data, placeholderData: keepPreviousData })

  const doExport = async () => {
    setExporting(true)
    try {
      const { data } = await api.get('orders', { params: { ...params, all: 1 } })
      exportExcel<any>(data.data, [
        { header: 'Order No', value: (r) => r.order_no }, { header: 'Receipt No', value: (r) => r.receipt_no }, { header: 'Queue', value: (r) => r.queue_no },
        { header: 'Date', value: (r) => dateTime(r.created_at) }, { header: 'Branch', value: (r) => r.branch?.name },
        { header: 'Customer', value: (r) => r.customer?.name ?? 'Walk-in' }, { header: 'Mobile', value: (r) => r.customer?.mobile },
        { header: 'Status', value: (r) => label(r.status) }, { header: 'Payment', value: (r) => label(r.payment_status) },
        { header: 'Weight (kg)', value: (r) => r.total_weight }, { header: 'Pieces', value: (r) => r.total_pieces },
        { header: 'Total', value: (r) => r.total }, { header: 'Paid', value: (r) => r.paid }, { header: 'Balance', value: (r) => r.balance },
        { header: 'Delivery', value: (r) => label(r.delivery_type) }, { header: 'Due', value: (r) => dateTime(r.delivery_at) }, { header: 'Cashier', value: (r) => r.user?.name },
      ], 'orders')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Orders" subtitle="Search by receipt, queue no, order no or mobile" icon={<ClipboardList className="h-5 w-5" />} actions={<>
        {can('orders.export') && <button className="btn-secondary" onClick={doExport} disabled={exporting}>{exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}Excel</button>}
        {can('pos.access') && <Link to="/pos" className="btn-primary"><Plus className="h-4 w-4" />New order</Link>}
      </>} />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput className="min-w-[220px] flex-1" value={f.q} onChange={(v) => set('q', v)} placeholder="Receipt / queue / order no / mobile…" />
          <Select className="w-auto" placeholder="All statuses" value={f.status} onChange={(e) => set('status', e.target.value)} options={(lookups?.order_statuses ?? []).map((s) => ({ value: s, label: label(s) }))} />
          <Select className="w-auto" placeholder="All payments" value={f.payment_status} onChange={(e) => set('payment_status', e.target.value)} options={['unpaid', 'partial', 'paid', 'refunded'].map((s) => ({ value: s, label: label(s) }))} />
          <Select className="w-auto" placeholder="Pickup & delivery" value={f.delivery_type} onChange={(e) => set('delivery_type', e.target.value)} options={[{ value: 'pickup', label: 'Pickup' }, { value: 'home_delivery', label: 'Home delivery' }]} />
          <DateRange from={f.from} to={f.to} onChange={(from, to) => { setF((s) => ({ ...s, from, to })); setPage(1) }} />
          {f.due_today && <button className="chip cursor-pointer bg-brand-100 py-1.5 text-brand-700" onClick={() => set('due_today', '')}>Due today ✕</button>}
        </div>
        <DataTable rows={q.data?.data ?? []} loading={q.isFetching} error={q.error} onRetry={() => q.refetch()} onRowClick={(r) => nav(`/orders/${r.id}`)} columns={[
          { key: 'order_no', header: 'Order', render: (r) => <div><p className="font-semibold text-brand-600">{r.order_no}</p><p className="text-xs text-slate-500">{r.receipt_no}</p></div> },
          { key: 'queue_no', header: 'Queue', render: (r) => <span className="font-bold">#{r.queue_no}</span> },
          { key: 'created_at', header: 'Date', render: (r) => <span className="text-xs">{dateTime(r.created_at)}</span> },
          { key: 'customer', header: 'Customer', render: (r) => r.customer ? <div><p className="font-medium">{r.customer.name}</p><p className="text-xs text-slate-500">{r.customer.mobile}</p></div> : <span className="text-slate-400">Walk-in</span> },
          { key: 'branch', header: 'Branch', render: (r) => r.branch?.code },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'payment_status', header: 'Payment', render: (r) => <StatusBadge status={r.payment_status} /> },
          { key: 'delivery_at', header: 'Due', render: (r) => <span className="text-xs">{label(r.delivery_type)}<br />{dateTime(r.delivery_at)}</span> },
          { key: 'total', header: 'Total', align: 'right', render: (r) => money(r.total) },
          { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className={r.balance > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>{money(r.balance)}</span> },
        ]} />
        {q.data && <Pagination page={q.data.current_page} last={q.data.last_page} total={q.data.total} onPage={setPage} />}
      </Card>
    </div>
  )
}
