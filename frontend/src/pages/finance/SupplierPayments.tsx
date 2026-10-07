import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Banknote, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type Paginated } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { date, label, money, today } from '../../lib/format'
import { DataTable } from '../../components/DataTable'
import { Card, DateRange, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Spinner } from '../../components/ui'

export default function SupplierPayments() {
  const { branchId, me, lookups } = useAuth()
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ q: '', from: '', to: '' })
  const [form, setForm] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const params = { ...f, page, branch_id: branchId || undefined }
  const list = useQuery({ queryKey: ['supplier-payments', params], queryFn: async () => (await api.get<Paginated<any>>('supplier-payments', { params })).data, placeholderData: keepPreviousData })
  const suppliers = useQuery({ queryKey: ['suppliers', 'options'], queryFn: async () => (await api.get('suppliers', { params: { all: 1, is_active: 1 } })).data.data as any[] })
  const ledger = useQuery({ queryKey: ['sup-ledger', form?.supplier_id], queryFn: async () => (await api.get(`ledger/suppliers/${form.supplier_id}`)).data, enabled: !!form?.supplier_id })

  const submit = async () => {
    setBusy(true)
    try {
      await api.post('supplier-payments', { ...form, grn_id: form.grn_id || null, branch_id: form.branch_id || undefined })
      toast.success('Payment recorded')
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
      <PageHeader title="Supplier Payments" subtitle="Pay suppliers against GRNs or on account" icon={<Banknote className="h-5 w-5" />}
        actions={<button className="btn-primary" onClick={() => setForm({ date: today(), method: 'cash', amount: '', branch_id: branchId ?? me?.user.branch_id ?? '' })}><Plus className="h-4 w-4" />New payment</button>} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput className="flex-1" value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Ref, supplier…" />
          <DateRange from={f.from} to={f.to} onChange={(from, to) => setF({ ...f, from, to })} />
        </div>
        <DataTable rows={list.data?.data ?? []} loading={list.isFetching && !list.data} columns={[
          { key: 'ref_no', header: 'Ref', render: (r) => <b>{r.ref_no}</b> }, { key: 'date', header: 'Date', render: (r) => date(r.date) },
          { key: 'supplier', header: 'Supplier', render: (r) => r.supplier?.name },
          { key: 'grn', header: 'GRN', render: (r) => r.grn ? `${r.grn.ref_no} (${r.grn.invoice_no})` : 'On account' },
          { key: 'method', header: 'Method', render: (r) => label(r.method) },
          { key: 'reference', header: 'Reference', render: (r) => [r.reference, r.cheque_no].filter(Boolean).join(' · ') || '—' },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => <b>{money(r.amount)}</b> },
        ]} />
        {list.data && <Pagination page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={setPage} />}
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title="Supplier payment" footer={<>
        <button className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
        <button className="btn-primary" disabled={busy || !form?.supplier_id || !form?.amount} onClick={submit}>{busy && <Spinner className="h-4 w-4" />}Save</button>
      </>}>
        {form && <div className="grid gap-4 sm:grid-cols-2">
          {me?.all_branches && <Field label="Branch"><Select value={form.branch_id} placeholder="— Select —" onChange={(e) => setForm({ ...form, branch_id: e.target.value })} options={(lookups?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Field>}
          <Field label="Supplier *"><Select value={form.supplier_id ?? ''} placeholder="— Select —" onChange={(e) => setForm({ ...form, supplier_id: e.target.value, grn_id: '' })} options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: `${s.name} (${money(s.balance)})` }))} /></Field>
          <Field label="Against GRN"><Select value={form.grn_id ?? ''} placeholder="On account" onChange={(e) => {
            const g = ledger.data?.open_grns.find((x: any) => String(x.id) === e.target.value)
            setForm({ ...form, grn_id: e.target.value, amount: g ? String(g.total - g.paid) : form.amount })
          }} options={(ledger.data?.open_grns ?? []).map((g: any) => ({ value: g.id, label: `${g.ref_no} · inv ${g.invoice_no} · due ${money(g.total - g.paid)}` }))} /></Field>
          <Field label="Date"><Input type="date" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Amount *"><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Method"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} options={['cash', 'card', 'bank_transfer', 'cheque'].map((m) => ({ value: m, label: label(m) }))} /></Field>
          <Field label="Reference"><Input value={form.reference ?? ''} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
          {form.method === 'cheque' && <>
            <Field label="Cheque no *"><Input value={form.cheque_no ?? ''} onChange={(e) => setForm({ ...form, cheque_no: e.target.value })} /></Field>
            <Field label="Cheque date"><Input type="date" value={form.cheque_date ?? ''} onChange={(e) => setForm({ ...form, cheque_date: e.target.value })} /></Field>
            <Field label="Bank"><Input value={form.bank ?? ''} onChange={(e) => setForm({ ...form, bank: e.target.value })} /></Field>
          </>}
          {form.method === 'cheque' && <p className="text-xs text-slate-500 sm:col-span-2">A cheque will be added to the Cheque Print register.</p>}
        </div>}
      </Modal>
    </div>
  )
}
