import { useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { LockKeyhole, PlayCircle, Printer, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type Paginated } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { dateTime, label, money } from '../../lib/format'
import { esc, printHtml } from '../../lib/print'
import { useShift } from '../../components/Layout'
import { DataTable } from '../../components/DataTable'
import { Card, Field, Input, Modal, PageHeader, Pagination, Select, Stat, StatusBadge, Textarea, cx } from '../../components/ui'
import { AsyncButton, Skeleton } from '../../components/feedback'

function printZ(s: any, business: string) {
  const rows = Object.entries(s.summary?.by_method ?? {}).map(([m, v]: any) => `<tr><td>${esc(label(m))}</td><td class="r">${money(v.in, false)}</td><td class="r">${money(v.out, false)}</td></tr>`).join('')
  printHtml(`<div class="w"><h2>${esc(business)}</h2><h3>SHIFT REPORT</h3>
    <p>Cashier: ${esc(s.user?.name ?? '')}<br>Branch: ${esc(s.branch?.name ?? '')}<br>Opened: ${esc(dateTime(s.opened_at))}<br>Closed: ${esc(dateTime(s.closed_at))}</p>
    <table><tr><th>Method</th><th class="r">In</th><th class="r">Out</th></tr>${rows}</table>
    <table><tr><td>Opening cash</td><td class="r">${money(s.opening_cash, false)}</td></tr><tr><td>Expected cash</td><td class="r">${money(s.expected_cash ?? s.summary?.expected_cash, false)}</td></tr>
    <tr><td>Counted cash</td><td class="r">${money(s.closing_cash, false)}</td></tr><tr><td><b>Difference</b></td><td class="r"><b>${money(s.difference, false)}</b></td></tr>
    <tr><td>Orders</td><td class="r">${s.summary?.orders ?? ''}</td></tr><tr><td>Sales</td><td class="r">${money(s.summary?.sales_total, false)}</td></tr></table></div>`,
  `.w{width:72mm;font-size:12px}h2,h3{text-align:center;margin:4px}table{width:100%;border-collapse:collapse;margin-top:8px}td,th{padding:2px 0;text-align:left}.r{text-align:right}`)
}

/** Cashier shift open / close (module 43). */
export default function Shifts() {
  const { me, lookups, branchId, can } = useAuth()
  const qc = useQueryClient()
  const current = useShift()
  const [page, setPage] = useState(1)
  const [openForm, setOpenForm] = useState<any>(null)
  const [closeForm, setCloseForm] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const list = useQuery({ queryKey: ['shifts', page, branchId], queryFn: async () => (await api.get<Paginated<any>>('shifts', { params: { page, branch_id: branchId || undefined } })).data, placeholderData: keepPreviousData })
  const s = current.data

  const act = async (fn: () => Promise<any>, msg: string, done: () => void) => {
    setBusy(true)
    try {
      const { data } = await fn()
      toast.success(msg)
      done()
      qc.invalidateQueries({ queryKey: ['shift-current'] })
      list.refetch()
      if (data?.status === 'closed') printZ(data, lookups?.settings.general.business_name ?? '')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Cashier Shifts" subtitle="Open a shift before billing; close it with a cash count" icon={<Timer className="h-5 w-5" />}
        actions={s ? <button className="btn-danger" onClick={() => setCloseForm({ closing_cash: '', notes: '' })}><LockKeyhole className="h-4 w-4" />Close shift</button>
          : <button className="btn-success" onClick={() => setOpenForm({ opening_cash: '', branch_id: branchId ?? me?.user.branch_id ?? '' })}><PlayCircle className="h-4 w-4" />Open shift</button>} />

      {current.isLoading ? <Skeleton className="h-44 w-full rounded-2xl" /> : s ? (
        <Card title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />Current shift · {s.branch?.name}</span>}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Opened" value={dateTime(s.opened_at).split(', ')[1]} sub={dateTime(s.opened_at).split(',')[0]} />
            <Stat label="Opening cash" value={money(s.opening_cash)} tone="sky" />
            <Stat label="Cash in" value={money(s.summary.cash_in)} tone="emerald" />
            <Stat label="Cash out" value={money(s.summary.cash_out)} tone="rose" />
            <Stat label="Expected in drawer" value={money(s.summary.expected_cash)} tone="violet" sub={`${s.summary.orders} orders · ${money(s.summary.sales_total)}`} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(s.summary.by_method).map(([m, v]: any) => <span key={m} className="chip bg-slate-100 py-1.5 dark:bg-slate-800">{label(m)}: in {money(v.in)} · out {money(v.out)}</span>)}
          </div>
        </Card>
      ) : <Card><p className="text-sm text-slate-500">You have no open shift.</p></Card>}

      <Card title={can('shifts.view_all') ? 'All shifts' : 'My shifts'} padded={false}>
        <DataTable rows={list.data?.data ?? []} loading={list.isFetching} error={list.error} onRetry={() => list.refetch()} columns={[
          { key: 'user', header: 'Cashier', render: (r) => r.user?.name }, { key: 'branch', header: 'Branch', render: (r) => r.branch?.name },
          { key: 'opened_at', header: 'Opened', render: (r) => dateTime(r.opened_at) }, { key: 'closed_at', header: 'Closed', render: (r) => dateTime(r.closed_at) },
          { key: 'opening_cash', header: 'Opening', align: 'right', render: (r) => money(r.opening_cash) },
          { key: 'expected_cash', header: 'Expected', align: 'right', render: (r) => (r.expected_cash != null ? money(r.expected_cash) : '—') },
          { key: 'closing_cash', header: 'Counted', align: 'right', render: (r) => (r.closing_cash != null ? money(r.closing_cash) : '—') },
          { key: 'difference', header: 'Difference', align: 'right', render: (r) => r.difference != null ? <b className={cx(r.difference < 0 ? 'text-rose-600' : r.difference > 0 ? 'text-amber-600' : 'text-emerald-600')}>{money(r.difference)}</b> : '—' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'p', header: '', render: (r) => r.status === 'closed' && <AsyncButton className="btn-icon" title="Print shift report" icon={<Printer className="h-4 w-4" />} onClick={async () => { try { printZ((await api.get(`shifts/${r.id}`)).data, lookups?.settings.general.business_name ?? '') } catch (e) { toast.error(errorMessage(e)) } }} /> },
        ]} />
        {list.data && <Pagination page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={setPage} />}
      </Card>

      <Modal open={!!openForm} onClose={() => setOpenForm(null)} title="Open shift" size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setOpenForm(null)}>Cancel</button>
        <button className="btn-success" disabled={busy || openForm?.opening_cash === ''} onClick={() => act(() => api.post('shifts/open', { ...openForm, branch_id: openForm.branch_id || undefined }), 'Shift opened', () => setOpenForm(null))}>Open</button>
      </>}>
        {openForm && <div className="space-y-4">
          {me?.all_branches && <Field label="Branch"><Select value={openForm.branch_id} placeholder="— Select —" onChange={(e) => setOpenForm({ ...openForm, branch_id: e.target.value })} options={(lookups?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Field>}
          <Field label="Opening cash in drawer"><Input type="number" step="0.01" autoFocus value={openForm.opening_cash} onChange={(e) => setOpenForm({ ...openForm, opening_cash: e.target.value })} /></Field>
        </div>}
      </Modal>
      <Modal open={!!closeForm} onClose={() => setCloseForm(null)} title="Close shift" size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setCloseForm(null)}>Cancel</button>
        <button className="btn-danger" disabled={busy || closeForm?.closing_cash === ''} onClick={() => act(() => api.post('shifts/close', closeForm), 'Shift closed', () => setCloseForm(null))}>Close & print</button>
      </>}>
        {closeForm && <div className="space-y-4">
          <p className="text-sm">Expected cash: <b>{money(s?.summary.expected_cash)}</b></p>
          <Field label="Counted cash"><Input type="number" step="0.01" autoFocus value={closeForm.closing_cash} onChange={(e) => setCloseForm({ ...closeForm, closing_cash: e.target.value })} /></Field>
          {closeForm.closing_cash !== '' && <p className="text-sm">Difference: <b>{money(Number(closeForm.closing_cash) - Number(s?.summary.expected_cash))}</b></p>}
          <Field label="Notes"><Textarea value={closeForm.notes} onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  )
}
