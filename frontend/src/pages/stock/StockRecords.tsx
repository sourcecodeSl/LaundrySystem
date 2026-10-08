import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download, PackageSearch } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type Paginated } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { exportExcel } from '../../lib/exportExcel'
import { dateTime, label, qty } from '../../lib/format'
import { DataTable } from '../../components/DataTable'
import { Card, DateRange, PageHeader, Pagination, Select, cx } from '../../components/ui'
import { AsyncButton } from '../../components/feedback'

const TYPES = ['opening', 'grn', 'supplier_return', 'adjustment', 'transfer_in', 'transfer_out', 'count']

export default function StockRecords() {
  const { branchId } = useAuth()
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ item_id: '', type: '', from: '', to: '' })
  const items = useQuery({ queryKey: ['items', 'options'], queryFn: async () => (await api.get('items', { params: { all: 1 } })).data.data })
  const params = { ...f, page, branch_id: branchId || undefined }
  const r = useQuery({ queryKey: ['movements', params], queryFn: async () => (await api.get<Paginated<any>>('stock/movements', { params })).data, placeholderData: keepPreviousData })
  const cols = [
    { header: 'Date', value: (m: any) => dateTime(m.created_at) }, { header: 'Item', value: (m: any) => m.item?.name }, { header: 'Branch', value: (m: any) => m.branch?.name },
    { header: 'Type', value: (m: any) => label(m.type) }, { header: 'Reference', value: (m: any) => m.reference }, { header: 'Qty', value: (m: any) => m.quantity }, { header: 'Balance', value: (m: any) => m.balance },
  ]
  return (
    <div>
      <PageHeader title="Stock Records" subtitle="Every stock movement, with running balance" icon={<PackageSearch className="h-5 w-5" />}
        actions={<AsyncButton className="btn-secondary" icon={<Download className="h-4 w-4" />} onClick={async () => { try { exportExcel((await api.get('stock/movements', { params: { ...params, all: 1 } })).data.data, cols, 'stock-records') } catch (e) { toast.error(errorMessage(e)) } }}>Excel</AsyncButton>} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <Select className="w-auto min-w-[200px]" placeholder="All items" value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })} options={(items.data ?? []).map((i: any) => ({ value: i.id, label: i.name }))} />
          <Select className="w-auto" placeholder="All types" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={TYPES.map((t) => ({ value: t, label: label(t) }))} />
          <DateRange from={f.from} to={f.to} onChange={(from, to) => setF({ ...f, from, to })} />
        </div>
        <DataTable rows={r.data?.data ?? []} loading={r.isFetching} error={r.error} onRetry={() => r.refetch()} columns={[
          { key: 'created_at', header: 'Date', render: (m) => <span className="text-xs">{dateTime(m.created_at)}</span> },
          { key: 'item', header: 'Item', render: (m) => <b>{m.item?.name}</b> },
          { key: 'branch', header: 'Branch', render: (m) => m.branch?.name },
          { key: 'type', header: 'Type', render: (m) => label(m.type) },
          { key: 'reference', header: 'Reference', render: (m) => <span className="font-mono text-xs">{m.reference}</span> },
          { key: 'quantity', header: 'Qty', align: 'right', render: (m) => <span className={cx('font-semibold', m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600')}>{m.quantity > 0 ? '+' : ''}{qty(m.quantity)}</span> },
          { key: 'balance', header: 'Balance', align: 'right', render: (m) => qty(m.balance) },
          { key: 'user', header: 'By', render: (m) => m.user?.name },
        ]} />
        {r.data && <Pagination page={r.data.current_page} last={r.data.last_page} total={r.data.total} onPage={setPage} />}
      </Card>
    </div>
  )
}
