import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Undo2 } from 'lucide-react'
import { api, type Paginated } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dateTime, label, money } from '../lib/format'
import { DataTable } from '../components/DataTable'
import { Card, DateRange, PageHeader, Pagination, SearchInput } from '../components/ui'

export default function SalesReturns() {
  const { branchId } = useAuth()
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ q: '', from: '', to: '' })
  const params = { ...f, page, branch_id: branchId || undefined }
  const list = useQuery({ queryKey: ['sales-returns', params], queryFn: async () => (await api.get<Paginated<any>>('sales-returns', { params })).data, placeholderData: keepPreviousData })
  return (
    <div>
      <PageHeader title="Sales Returns" subtitle="Create returns from the order page" icon={<Undo2 className="h-5 w-5" />} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput className="flex-1" value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Return no or order no…" />
          <DateRange from={f.from} to={f.to} onChange={(from, to) => setF({ ...f, from, to })} />
        </div>
        <DataTable rows={list.data?.data ?? []} loading={list.isFetching && !list.data} columns={[
          { key: 'ref_no', header: 'Return', render: (r) => <b>{r.ref_no}</b> },
          { key: 'created_at', header: 'Date', render: (r) => dateTime(r.created_at) },
          { key: 'order', header: 'Order', render: (r) => <Link className="text-brand-600 hover:underline" to={`/orders/${r.order_id}`}>{r.order?.order_no}</Link> },
          { key: 'customer', header: 'Customer', render: (r) => r.customer?.name ?? 'Walk-in' },
          { key: 'refund_method', header: 'Refund', render: (r) => label(r.refund_method) },
          { key: 'reason', header: 'Reason' }, { key: 'user', header: 'By', render: (r) => r.user?.name },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => <b>{money(r.amount)}</b> },
        ]} />
        {list.data && <Pagination page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={setPage} />}
      </Card>
    </div>
  )
}
