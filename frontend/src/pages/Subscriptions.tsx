import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Ban, Crown, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type Paginated } from '../lib/api'
import { useAuth } from '../lib/auth'
import { date, label, money, qty, today } from '../lib/format'
import { CustomerPicker } from '../components/CustomerPicker'
import { DataTable } from '../components/DataTable'
import { Card, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Spinner, StatusBadge } from '../components/ui'

/** Billing transactions (module 59): customer subscriptions to billing plans. */
export default function Subscriptions() {
  const { branchId, me } = useAuth()
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ q: '', status: '' })
  const [form, setForm] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const params = { ...f, page, branch_id: branchId || undefined }
  const list = useQuery({ queryKey: ['billing-tx', params], queryFn: async () => (await api.get<Paginated<any>>('billing-transactions', { params })).data, placeholderData: keepPreviousData })
  const plans = useQuery({ queryKey: ['billing-plans', 'options'], queryFn: async () => (await api.get('billing-plans', { params: { all: 1, is_active: 1 } })).data.data as any[] })
  const plan = plans.data?.find((p) => String(p.id) === String(form?.billing_plan_id))

  const save = async () => {
    setBusy(true)
    try {
      await api.post('billing-transactions', { ...form, customer_id: form.customer?.id, branch_id: branchId ?? me?.user.branch_id ?? undefined, paid: Number(form.paid) || 0 })
      toast.success('Subscription created')
      setForm(null)
      list.refetch()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Plan Subscriptions" subtitle="Customer memberships and package billing" icon={<Crown className="h-5 w-5" />}
        actions={<button className="btn-primary" onClick={() => setForm({ customer: null, billing_plan_id: '', starts_on: today(), paid: '', method: 'cash' })}><Plus className="h-4 w-4" />New subscription</button>} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput className="flex-1" value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Ref, customer…" />
          <Select className="w-auto" placeholder="All statuses" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={['active', 'expired', 'cancelled'].map((s) => ({ value: s, label: label(s) }))} />
        </div>
        <DataTable rows={list.data?.data ?? []} loading={list.isFetching && !list.data} columns={[
          { key: 'ref_no', header: 'Ref', render: (r) => <b>{r.ref_no}</b> },
          { key: 'customer', header: 'Customer', render: (r) => <div>{r.customer?.name}<p className="text-xs text-slate-500">{r.customer?.mobile}</p></div> },
          { key: 'plan', header: 'Plan', render: (r) => r.plan?.name },
          { key: 'period', header: 'Period', render: (r) => `${date(r.starts_on)} → ${date(r.ends_on)}` },
          { key: 'usage', header: 'Usage', render: (r) => `${qty(r.weight_used)}${r.plan?.weight_limit ? ' / ' + qty(r.plan.weight_limit) : ''} kg · ${r.pieces_used}${r.plan?.piece_limit ? ' / ' + r.plan.piece_limit : ''} pcs` },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => money(r.amount) },
          { key: 'paid', header: 'Paid', align: 'right', render: (r) => money(r.paid) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'x', header: '', render: (r) => r.status === 'active' && <button className="btn-icon hover:!text-rose-600" title="Cancel" onClick={async () => {
            try { await api.post(`billing-transactions/${r.id}/cancel`); list.refetch() } catch (e) { toast.error(errorMessage(e)) }
          }}><Ban className="h-4 w-4" /></button> },
        ]} />
        {list.data && <Pagination page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={setPage} />}
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title="New subscription" footer={<>
        <button className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
        <button className="btn-primary" disabled={busy || !form?.customer || !form?.billing_plan_id} onClick={save}>{busy && <Spinner className="h-4 w-4" />}Subscribe</button>
      </>}>
        {form && <div className="space-y-4">
          <Field label="Customer"><CustomerPicker value={form.customer} onChange={(c) => setForm({ ...form, customer: c })} /></Field>
          <Field label="Plan"><Select value={form.billing_plan_id} placeholder="— Select —" onChange={(e) => {
            const p = plans.data?.find((x) => String(x.id) === e.target.value)
            setForm({ ...form, billing_plan_id: e.target.value, paid: p ? String(p.price) : '' })
          }} options={(plans.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${money(p.price)} / ${p.duration_days}d` }))} /></Field>
          {plan && <p className="rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10">{plan.description} · {plan.discount_percent}% discount on orders while active</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Starts on"><Input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></Field>
            <Field label="Paid now"><Input type="number" step="0.01" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} /></Field>
            <Field label="Method"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} options={['cash', 'card', 'bank_transfer', 'cheque'].map((m) => ({ value: m, label: label(m) }))} /></Field>
          </div>
        </div>}
      </Modal>
    </div>
  )
}
