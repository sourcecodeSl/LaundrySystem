import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, Plus, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { money } from '../lib/format'
import { Field, Input, Modal, Spinner } from './ui'

export type CustomerLite = { id: number; name: string; mobile: string; balance: number; credit_limit: number; address?: string }

export function CustomerPicker({ value, onChange }: { value: CustomerLite | null; onChange: (c: CustomerLite | null) => void }) {
  const { can, branchId } = useAuth()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', mobile: '', address: '' })
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const res = useQuery({
    queryKey: ['customer-search', q],
    queryFn: async () => (await api.get('customers', { params: { q, per_page: 8, is_active: 1 } })).data.data as CustomerLite[],
    enabled: open && q.length >= 2,
  })

  useEffect(() => {
    const h = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const create = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('customers', { ...form, branch_id: branchId ?? undefined, sms_opt_in: true, is_active: true })
      onChange(data)
      setAdding(false)
      toast.success('Customer added')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 font-bold text-white">{value.name.charAt(0)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{value.name}</p>
          <p className="text-xs text-slate-500">{value.mobile} · Balance <b className={value.balance > 0 ? 'text-rose-600' : ''}>{money(value.balance)}</b>
            {value.credit_limit > 0 && <> · Limit {money(value.credit_limit)}</>}</p>
        </div>
        <button className="btn-icon" onClick={() => onChange(null)} title="Remove"><X className="h-4 w-4" /></button>
      </div>
    )
  }

  return (
    <div ref={box} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Customer mobile or name (walk-in if empty)" value={q}
            onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true) }} />
        </div>
        {can('customers.create') && (
          <button className="btn-secondary px-3" title="New customer" onClick={() => { setForm({ name: '', mobile: /^\d+$/.test(q) ? q : '', address: '' }); setAdding(true) }}>
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && q.length >= 2 && (
        <div className="slide-up absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {res.isFetching && <div className="p-4 text-center"><Spinner className="mx-auto h-4 w-4" /></div>}
          {res.data?.map((c) => (
            <button key={c.id} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => { onChange(c); setQ(''); setOpen(false) }}>
              <UserRound className="h-4 w-4 text-slate-400" />
              <span className="flex-1"><b className="text-sm">{c.name}</b><span className="block text-xs text-slate-500">{c.mobile}</span></span>
              {c.balance > 0 && <span className="text-xs font-semibold text-rose-600">{money(c.balance)}</span>}
            </button>
          ))}
          {res.data?.length === 0 && <p className="p-4 text-center text-sm text-slate-500">No customers found</p>}
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="New customer" size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
        <button className="btn-primary" disabled={busy || !form.name || !form.mobile} onClick={create}>{busy && <Spinner className="h-4 w-4" />}Add customer</button>
      </>}>
        <div className="space-y-4">
          <Field label="Name *"><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Mobile *"><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
          <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  )
}
