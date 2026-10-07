import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, CalendarClock, ClipboardList, Coins, Gauge, HandCoins, Plus, Receipt, Scale, Wallet } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ORDER_FLOW, date, label, money, monthStart, qty, today } from '../lib/format'
import { Card, DateRange, Empty, PageHeader, Spinner, Stat, StatusBadge } from '../components/ui'

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e']

export default function Dashboard() {
  const { branchId, can, me } = useAuth()
  const [range, setRange] = useState({ from: monthStart(), to: today() })
  const q = useQuery({
    queryKey: ['dashboard', range, branchId],
    queryFn: async () => (await api.get('dashboard', { params: { ...range, branch_id: branchId || undefined } })).data,
  })
  const d = q.data
  const k = d?.kpis

  return (
    <div>
      <PageHeader title={`Hello, ${me?.user.name.split(' ')[0]} 👋`} subtitle="Here's what's happening across your laundry" icon={<Gauge className="h-5 w-5" />}
        actions={<>
          <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          {can('pos.access') && <Link to="/pos" className="btn-primary"><Plus className="h-4 w-4" />New order</Link>}
        </>} />

      {!d ? <div className="grid h-64 place-items-center"><Spinner className="h-7 w-7 text-brand-500" /></div> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Sales" value={money(k.sales)} icon={<Receipt className="h-5 w-5" />} sub={`Net ${money(k.net_sales)} · avg ${money(k.avg_order)}`} />
            <Stat label="Collected" value={money(k.collected)} tone="emerald" icon={<HandCoins className="h-5 w-5" />} sub="All payment methods" />
            <Stat label="Outstanding" value={money(k.outstanding)} tone="rose" icon={<Wallet className="h-5 w-5" />} sub="Balance pending on orders" />
            <Stat label="Expenses" value={money(k.expenses)} tone="amber" icon={<Coins className="h-5 w-5" />} sub="Other expenses in range" />
            <Stat label="Orders" value={k.orders} tone="sky" icon={<ClipboardList className="h-5 w-5" />} />
            <Stat label="Processed" value={`${qty(k.weight)} kg`} tone="violet" icon={<Scale className="h-5 w-5" />} sub={`${k.pieces} pieces`} />
            <Stat label="Due today" value={k.due_today} tone="sky" icon={<CalendarClock className="h-5 w-5" />} sub={<Link className="text-brand-600 hover:underline" to="/orders?due_today=1">View orders</Link>} />
            <Stat label="Overdue" value={k.overdue} tone="rose" icon={<AlertTriangle className="h-5 w-5" />} sub="Past promised delivery" />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card title="Sales trend" className="xl:col-span-2">
              {d.daily.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={d.daily.map((x: any) => ({ ...x, sales: Number(x.sales), collected: Number(x.collected) }))}>
                    <defs>
                      <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="1" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#06b6d4" stopOpacity={0.3} /><stop offset="1" stopColor="#06b6d4" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="day" tickFormatter={(v) => date(v).slice(0, 6)} fontSize={11} stroke="#94a3b8" />
                    <YAxis fontSize={11} stroke="#94a3b8" width={60} />
                    <Tooltip formatter={(v) => money(v)} labelFormatter={(l) => date(String(l))} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,.25)' }} />
                    <Area type="monotone" dataKey="sales" name="Sales" stroke="#6366f1" strokeWidth={2.5} fill="url(#gs)" />
                    <Area type="monotone" dataKey="collected" name="Collected" stroke="#06b6d4" strokeWidth={2} fill="url(#gc)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Empty title="No sales in this range" />}
            </Card>

            <Card title="Production pipeline">
              <div className="space-y-3">
                {ORDER_FLOW.filter((s) => s !== 'delivered').map((s) => {
                  const n = Number(d.status_counts[s] ?? 0)
                  const total = Object.values(d.status_counts as Record<string, number>).reduce((a, b) => a + Number(b), 0) || 1
                  return (
                    <div key={s}>
                      <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{label(s)}</span><span className="font-bold">{n}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500" style={{ width: `${(n / total) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              {can('orders.status') && <Link to="/production" className="btn-secondary mt-5 w-full">Open production board</Link>}
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card title="Sales by service">
              {d.by_service.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={d.by_service.map((x: any) => ({ ...x, total: Number(x.total) }))} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={100} fontSize={11} stroke="#94a3b8" />
                    <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 12, border: 'none' }} />
                    <Bar dataKey="total" radius={[0, 8, 8, 0]}>{d.by_service.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty title="No data" />}
            </Card>
            <Card title="Payment methods">
              {Object.keys(d.by_payment_method).length ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={200}>
                    <PieChart>
                      <Pie data={Object.entries(d.by_payment_method).map(([name, v]) => ({ name, value: Number(v) }))} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                        {Object.keys(d.by_payment_method).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => money(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 text-sm">
                    {Object.entries(d.by_payment_method).map(([m, v], i) => (
                      <div key={m} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-500">{label(m)}</span><b className="ml-auto pl-3">{money(v)}</b></div>
                    ))}
                  </div>
                </div>
              ) : <Empty title="No payments" />}
            </Card>
            <Card title="Low stock">
              {d.low_stock.length ? (
                <div className="space-y-2">
                  {d.low_stock.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm dark:bg-amber-500/10">
                      <span className="font-medium">{s.name}</span>
                      <span className="font-bold text-amber-700 dark:text-amber-300">{qty(s.quantity)} {s.unit} <span className="font-normal text-slate-500">/ {qty(s.reorder_level)}</span></span>
                    </div>
                  ))}
                </div>
              ) : <Empty title="Stock looks healthy" />}
            </Card>
          </div>

          <Card title="Recent orders" padded={false} actions={<Link to="/orders" className="btn-ghost btn-sm">View all</Link>}>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Order</th><th>Queue</th><th>Customer</th><th>Status</th><th>Payment</th><th className="text-right">Total</th><th className="text-right">Balance</th></tr></thead>
                <tbody>
                  {d.recent_orders.map((o: any) => (
                    <tr key={o.id}>
                      <td><Link className="font-semibold text-brand-600 hover:underline" to={`/orders/${o.id}`}>{o.order_no}</Link></td>
                      <td>#{o.queue_no}</td>
                      <td>{o.customer?.name ?? 'Walk-in'}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td><StatusBadge status={o.payment_status} /></td>
                      <td className="text-right tabular-nums">{money(o.total)}</td>
                      <td className="text-right tabular-nums">{money(o.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.recent_orders.length && <Empty title="No orders yet" />}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
