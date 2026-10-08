import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, CheckCircle2, ClipboardCheck, Eye, Package, PackageMinus, PackagePlus, Plus, Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type Paginated } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { date, label, money, qty, today } from '../../lib/format'
import { DataTable } from '../../components/DataTable'
import { Card, DateRange, Empty, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Spinner, StatusBadge, Textarea, Toggle } from '../../components/ui'
import { AsyncButton, useConfirm } from '../../components/feedback'

const DOCS: Record<string, { title: string; subtitle: string; perm: string; icon: any; qtyLabel: string }> = {
  grns: { title: 'GRN / Stock Add', subtitle: 'Receive consumables from suppliers with invoice number', perm: 'inventory.grn', icon: PackagePlus, qtyLabel: 'Qty received' },
  'supplier-returns': { title: 'Supplier Return Notes', subtitle: 'Return goods to a supplier', perm: 'inventory.supplier_return', icon: PackageMinus, qtyLabel: 'Qty returned' },
  adjustments: { title: 'Stock Adjustments', subtitle: 'Positive or negative corrections (usage, wastage, damage)', perm: 'inventory.adjustment', icon: Wrench, qtyLabel: '+/- Qty' },
  transfers: { title: 'Stock Transfers', subtitle: 'Move stock between branches', perm: 'inventory.transfer', icon: ArrowLeftRight, qtyLabel: 'Qty to transfer' },
  counts: { title: 'Stock Count', subtitle: 'Physical count; applying posts the variance', perm: 'inventory.count', icon: ClipboardCheck, qtyLabel: 'Counted qty' },
  opening: { title: 'Opening Stock', subtitle: 'Initial stock balances per branch', perm: 'inventory.opening', icon: Package, qtyLabel: 'Opening qty' },
}

type Line = { item_id: string; quantity: string; unit_cost: string }

export default function StockDocs() {
  const { type = 'grns' } = useParams()
  const cfg = DOCS[type]
  const { can, branchId, lookups, me } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ q: '', from: '', to: '' })
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [lines, setLines] = useState<Line[]>([])
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()

  const params = { ...f, page, branch_id: branchId || undefined }
  const list = useQuery({ queryKey: ['stock-docs', type, params], queryFn: async () => (await api.get<Paginated<any>>(`stock/${type}`, { params })).data, placeholderData: keepPreviousData, enabled: !!cfg })
  const items = useQuery({ queryKey: ['items', 'options'], queryFn: async () => (await api.get('items', { params: { all: 1, is_active: 1 } })).data.data as any[] })
  const suppliers = useQuery({ queryKey: ['suppliers', 'options'], queryFn: async () => (await api.get('suppliers', { params: { all: 1, is_active: 1 } })).data.data as any[], enabled: ['grns', 'supplier-returns'].includes(type) })

  if (!cfg) return <Empty title="Unknown document" />
  const Icon = cfg.icon
  const hasCost = !['transfers', 'counts'].includes(type)

  const openNew = () => {
    setForm({ date: today(), branch_id: branchId ?? me?.user.branch_id ?? '', payment_method: 'cash', paid: '', apply: false })
    setLines([{ item_id: '', quantity: '', unit_cost: '' }])
    setOpen(true)
  }
  const setLine = (i: number, p: Partial<Line>) => setLines(lines.map((l, idx) => {
    if (idx !== i) return l
    const n = { ...l, ...p }
    if (p.item_id && !l.unit_cost) n.unit_cost = String(items.data?.find((x) => String(x.id) === p.item_id)?.cost_price ?? '')
    return n
  }))
  const total = lines.reduce((s, l) => s + Math.abs(Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0)

  const submit = async () => {
    setBusy(true)
    try {
      await api.post(`stock/${type}`, {
        ...form, paid: Number(form.paid) || 0, branch_id: form.branch_id || undefined,
        items: lines.filter((l) => l.item_id).map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity), unit_cost: l.unit_cost === '' ? undefined : Number(l.unit_cost) })),
      })
      toast.success(`${cfg.title} saved`)
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['stock-docs', type] })
      qc.invalidateQueries({ queryKey: ['stock-levels'] })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const show = async (id: number) => {
    const t = toast.loading('Opening document…')
    try { setView((await api.get(`stock/${type}/${id}`)).data); toast.dismiss(t) } catch (e) { toast.error(errorMessage(e), { id: t }) }
  }
  const applyCount = async () => {
    if (!(await confirm({ title: 'Apply this stock count?', message: 'Stock on hand will be set to the counted quantities and the variance posted to stock records. This cannot be undone.', confirmText: 'Apply count', danger: false }))) return
    try {
      setView((await api.post(`stock/counts/${view.id}/apply`)).data)
      toast.success('Stock count applied')
      list.refetch()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader key={type} title={cfg.title} subtitle={cfg.subtitle} icon={<Icon className="h-5 w-5" />}
        actions={can(cfg.perm) && <button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" />New</button>} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput className="flex-1" value={f.q} onChange={(q) => setF({ ...f, q })} placeholder={type === 'grns' ? 'Ref no or invoice no…' : 'Ref no…'} />
          <DateRange from={f.from} to={f.to} onChange={(from, to) => setF({ ...f, from, to })} />
        </div>
        <DataTable rows={list.data?.data ?? []} loading={list.isFetching} error={list.error} onRetry={() => list.refetch()} onRowClick={(r) => show(r.id)} columns={[
          { key: 'ref_no', header: 'Ref', render: (r) => <b>{r.ref_no}</b> },
          { key: 'date', header: 'Date', render: (r) => date(r.date) },
          { key: 'branch', header: 'Branch', render: (r) => r.branch?.name },
          ...(['grns', 'supplier-returns'].includes(type) ? [{ key: 'supplier', header: 'Supplier', render: (r: any) => r.supplier?.name }] : []),
          ...(type === 'grns' ? [{ key: 'invoice_no', header: 'Invoice #' }] : []),
          ...(type === 'transfers' ? [{ key: 'to', header: 'To branch', render: (r: any) => r.to_branch?.name }] : []),
          ...(type === 'adjustments' ? [{ key: 'reason', header: 'Reason' }] : []),
          ...(type === 'counts' ? [{ key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }] : []),
          { key: 'items_count', header: 'Lines', align: 'right' as const },
          { key: 'total', header: type === 'counts' ? 'Variance value' : 'Total', align: 'right' as const, render: (r: any) => money(r.total) },
          ...(type === 'grns' ? [{ key: 'paid', header: 'Paid', align: 'right' as const, render: (r: any) => money(r.paid) }] : []),
          { key: 'v', header: '', align: 'right' as const, render: () => <Eye className="ml-auto h-4 w-4 text-slate-400" /> },
        ]} />
        {list.data && <Pagination page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={setPage} />}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={`New ${cfg.title}`} size="xl" footer={<>
        <span className="mr-auto self-center text-sm">Total: <b>{money(total)}</b></span>
        <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn-primary" disabled={busy || !lines.some((l) => l.item_id)} onClick={submit}>{busy && <Spinner className="h-4 w-4" />}Save</button>
      </>}>
        <div className="grid gap-4 sm:grid-cols-3">
          {me?.all_branches && <Field label="Branch"><Select value={form.branch_id} placeholder="— Select —" onChange={(e) => setForm({ ...form, branch_id: e.target.value })} options={(lookups?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Field>}
          <Field label="Date"><Input type="date" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          {['grns', 'supplier-returns'].includes(type) && <Field label="Supplier *"><Select value={form.supplier_id ?? ''} placeholder="— Select —" onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>}
          {type === 'grns' && <>
            <Field label="Supplier invoice no *"><Input value={form.invoice_no ?? ''} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} /></Field>
            <Field label="Paid now"><Input type="number" step="0.01" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} /></Field>
            <Field label="Payment method"><Select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} options={['cash', 'card', 'bank_transfer', 'cheque'].map((m) => ({ value: m, label: label(m) }))} /></Field>
          </>}
          {type === 'adjustments' && <Field label="Reason *" className="sm:col-span-2"><Input value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Daily usage, spillage" /></Field>}
          {type === 'transfers' && <Field label="To branch *"><Select value={form.to_branch_id ?? ''} placeholder="— Select —" onChange={(e) => setForm({ ...form, to_branch_id: e.target.value })} options={(lookups?.branches ?? []).filter((b) => String(b.id) !== String(form.branch_id)).map((b) => ({ value: b.id, label: b.name }))} /></Field>}
          {type === 'counts' && <div className="flex items-end pb-2"><Toggle checked={!!form.apply} onChange={(v) => setForm({ ...form, apply: v })} label="Apply variance immediately" /></div>}
        </div>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
          <table className="table-base">
            <thead><tr><th>Item</th><th className="text-right">{cfg.qtyLabel}</th>{hasCost && <th className="text-right">Unit cost</th>}{hasCost && <th className="text-right">Line total</th>}<th /></tr></thead>
            <tbody>{lines.map((l, i) => (
              <tr key={i}>
                <td className="min-w-[220px]"><Select value={l.item_id} placeholder="— Item —" onChange={(e) => setLine(i, { item_id: e.target.value })}
                  options={(items.data ?? []).filter((x) => x.id === Number(l.item_id) || !lines.some((o) => o.item_id === String(x.id))).map((x) => ({ value: x.id, label: `${x.name} (${x.unit})` }))} /></td>
                <td><Input type="number" step="0.001" className="ml-auto w-28 text-right" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                {hasCost && <td><Input type="number" step="0.01" className="ml-auto w-28 text-right" value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} /></td>}
                {hasCost && <td className="text-right font-semibold">{money(Math.abs(Number(l.quantity) || 0) * (Number(l.unit_cost) || 0))}</td>}
                <td><button className="btn-icon" onClick={() => setLines(lines.filter((_, x) => x !== i))}><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
          <div className="p-3"><button className="btn-secondary btn-sm" onClick={() => setLines([...lines, { item_id: '', quantity: '', unit_cost: '' }])}><Plus className="h-3.5 w-3.5" />Add line</button></div>
        </div>
        <Field label="Notes" className="mt-4"><Textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </Modal>

      <Modal open={!!view} onClose={() => setView(null)} title={view?.ref_no} size="lg" footer={type === 'counts' && view?.status === 'draft' && can('inventory.count') &&
        <AsyncButton className="btn-success" onClick={applyCount} icon={<CheckCircle2 className="h-4 w-4" />}>Apply count</AsyncButton>}>
        {view && <>
          <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">Date:</span> {date(view.date)}</p>
            <p><span className="text-slate-500">Branch:</span> {view.branch?.name}</p>
            {view.supplier && <p><span className="text-slate-500">Supplier:</span> {view.supplier.name}</p>}
            {view.invoice_no && <p><span className="text-slate-500">Invoice:</span> {view.invoice_no}</p>}
            {view.to_branch && <p><span className="text-slate-500">To:</span> {view.to_branch.name}</p>}
            {view.reason && <p><span className="text-slate-500">Reason:</span> {view.reason}</p>}
            <p><span className="text-slate-500">By:</span> {view.user?.name}</p>
            {view.status && <p><StatusBadge status={view.status} /></p>}
          </div>
          <table className="table-base">
            <thead><tr><th>Item</th>{type === 'counts' && <th className="text-right">System</th>}<th className="text-right">Qty</th>{type === 'counts' && <th className="text-right">Variance</th>}<th className="text-right">Cost</th><th className="text-right">Total</th></tr></thead>
            <tbody>{view.items.map((l: any) => (
              <tr key={l.id}><td>{l.item?.name}</td>{type === 'counts' && <td className="text-right">{qty(l.system_quantity)}</td>}<td className="text-right">{qty(l.quantity)}</td>
                {type === 'counts' && <td className="text-right font-semibold">{qty(l.quantity - l.system_quantity)}</td>}
                <td className="text-right">{money(l.unit_cost)}</td><td className="text-right">{money(l.total)}</td></tr>
            ))}</tbody>
          </table>
          {view.notes && <p className="mt-4 text-sm text-slate-500">{view.notes}</p>}
        </>}
      </Modal>
    </div>
  )
}
