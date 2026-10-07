import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Boxes, Download } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { exportExcel } from '../../lib/exportExcel'
import { money, qty } from '../../lib/format'
import { DataTable } from '../../components/DataTable'
import { Card, PageHeader, SearchInput, Stat, Toggle } from '../../components/ui'

export default function StockLevels() {
  const { branchId } = useAuth()
  const [q, setQ] = useState('')
  const [low, setLow] = useState(false)
  const r = useQuery({ queryKey: ['stock-levels', branchId, q, low], queryFn: async () => (await api.get('stock/levels', { params: { branch_id: branchId || undefined, q, low_only: low ? 1 : 0 } })).data })
  const rows: any[] = r.data?.data ?? []
  return (
    <div>
      <PageHeader title="Stock Levels" subtitle={branchId ? 'Selected branch' : 'All branches combined'} icon={<Boxes className="h-5 w-5" />}
        actions={<button className="btn-secondary" onClick={() => exportExcel<any>(rows, [
          { header: 'Code', value: (x) => x.code }, { header: 'Item', value: (x) => x.name }, { header: 'Unit', value: (x) => x.unit },
          { header: 'Quantity', value: (x) => x.quantity }, { header: 'Reorder level', value: (x) => x.reorder_level }, { header: 'Cost', value: (x) => x.cost_price }, { header: 'Value', value: (x) => x.value },
        ], 'stock-levels')}><Download className="h-4 w-4" />Excel</button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Items" value={rows.length} />
        <Stat label="Low stock" value={rows.filter((x: any) => x.low).length} tone="amber" />
        <Stat label="Stock value" value={money(r.data?.total_value)} tone="emerald" />
      </div>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput className="flex-1" value={q} onChange={setQ} placeholder="Search items…" />
          <Toggle checked={low} onChange={setLow} label="Low stock only" />
        </div>
        <DataTable rows={rows} loading={r.isFetching && !r.data} columns={[
          { key: 'code', header: 'Code', render: (x) => <span className="font-mono text-xs">{x.code}</span> },
          { key: 'name', header: 'Item', render: (x) => <b>{x.name}</b> },
          { key: 'quantity', header: 'On hand', align: 'right', render: (x) => <span className={x.low ? 'font-bold text-amber-600' : 'font-semibold'}>{qty(x.quantity)} {x.unit}</span> },
          { key: 'reorder_level', header: 'Reorder at', align: 'right', render: (x) => qty(x.reorder_level) },
          { key: 'bar', header: 'Level', render: (x) => (
            <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={x.low ? 'h-full bg-amber-500' : 'h-full bg-emerald-500'} style={{ width: `${Math.min(100, (x.quantity / Math.max(1, x.reorder_level * 3)) * 100)}%` }} />
            </div>
          ) },
          { key: 'value', header: 'Value', align: 'right', render: (x) => money(x.value) },
        ]} />
      </Card>
    </div>
  )
}
