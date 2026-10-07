import { useQuery } from '@tanstack/react-query'
import { Download, Warehouse } from 'lucide-react'
import { api } from '../../lib/api'
import { exportExcel } from '../../lib/exportExcel'
import { qty } from '../../lib/format'
import { Card, PageHeader, Spinner, cx } from '../../components/ui'

export default function BranchStock() {
  const r = useQuery({ queryKey: ['branch-stock'], queryFn: async () => (await api.get('stock/branch')).data })
  if (!r.data) return <Spinner />
  const { branches, items } = r.data
  return (
    <div>
      <PageHeader title="Branch Stock" subtitle="Item quantities across branches" icon={<Warehouse className="h-5 w-5" />}
        actions={<button className="btn-secondary" onClick={() => exportExcel<any>(items, [
          { header: 'Item', value: (i) => i.name }, ...branches.map((b: any) => ({ header: b.name, value: (i: any) => i.stock[b.id] })),
        ], 'branch-stock')}><Download className="h-4 w-4" />Excel</button>} />
      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Item</th>{branches.map((b: any) => <th key={b.id} className="text-right">{b.name}</th>)}<th className="text-right">Total</th></tr></thead>
            <tbody>{items.map((i: any) => {
              const total = Object.values(i.stock as Record<string, number>).reduce((a, b) => a + Number(b), 0)
              return (
                <tr key={i.id}><td><b>{i.name}</b> <span className="text-xs text-slate-400">{i.code}</span></td>
                  {branches.map((b: any) => <td key={b.id} className={cx('text-right', i.stock[b.id] <= i.reorder_level && 'font-semibold text-amber-600')}>{qty(i.stock[b.id])} {i.unit}</td>)}
                  <td className="text-right font-bold">{qty(total)}</td></tr>
              )
            })}</tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
