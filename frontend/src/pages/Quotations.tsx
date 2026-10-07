import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightCircle, FileText, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type Paginated } from '../lib/api'
import { useAuth } from '../lib/auth'
import { date, label, money, qty } from '../lib/format'
import { esc, printHtml } from '../lib/print'
import { DataTable } from '../components/DataTable'
import { Card, Confirm, PageHeader, Pagination, SearchInput, Select, StatusBadge } from '../components/ui'

export default function Quotations() {
  const { can, branchId, lookups } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ q: '', status: '' })
  const [converting, setConverting] = useState<any>(null)
  const [deleting, setDeleting] = useState<any>(null)
  const params = { ...f, page, branch_id: branchId || undefined }
  const list = useQuery({ queryKey: ['quotations', params], queryFn: async () => (await api.get<Paginated<any>>('quotations', { params })).data, placeholderData: keepPreviousData })

  const print = async (id: number) => {
    const { data: qt } = await api.get(`quotations/${id}`)
    const g = lookups?.settings.general ?? {}
    printHtml(`<div class="w">
      <div class="hd"><div><h1>${esc(g.business_name)}</h1><p>${esc(qt.branch?.name)} · ${esc(qt.branch?.phone ?? '')}</p></div>
        <div class="r"><h2>QUOTATION</h2><p>${esc(qt.quotation_no)}<br>Date: ${esc(date(qt.created_at))}<br>Valid until: ${esc(date(qt.valid_until))}</p></div></div>
      <p><b>To:</b> ${esc(qt.customer?.name ?? qt.customer_name ?? '')} ${esc(qt.customer?.mobile ?? qt.customer_mobile ?? '')}</p>
      <table><thead><tr><th>#</th><th>Description</th><th class="r">Qty / Weight</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>
      ${qt.items.map((i: any, n: number) => `<tr><td>${n + 1}</td><td>${esc(i.description)}</td><td class="r">${i.pricing_type === 'weight_range' ? qty(i.weight) + ' kg' : qty(i.quantity)}</td><td class="r">${money(i.unit_price, false)}</td><td class="r">${money(i.total, false)}</td></tr>`).join('')}
      </tbody></table>
      <table class="t"><tr><td>Subtotal</td><td class="r">${money(qt.subtotal)}</td></tr>
      ${qt.discount > 0 ? `<tr><td>Discount</td><td class="r">-${money(qt.discount)}</td></tr>` : ''}
      ${qt.service_charge > 0 ? `<tr><td>Service charge</td><td class="r">${money(qt.service_charge)}</td></tr>` : ''}
      ${qt.tax > 0 ? `<tr><td>Tax</td><td class="r">${money(qt.tax)}</td></tr>` : ''}
      <tr class="b"><td>Total</td><td class="r">${money(qt.total)}</td></tr></table>
      ${qt.notes ? `<p>Notes: ${esc(qt.notes)}</p>` : ''}</div>`,
    `@page{size:A4;margin:15mm}.w{font-size:13px}.hd{display:flex;justify-content:space-between;border-bottom:3px solid #4f46e5;padding-bottom:10px;margin-bottom:14px}
     h1{margin:0;color:#4f46e5}h2{margin:0;letter-spacing:2px}.r{text-align:right}table{width:100%;border-collapse:collapse;margin-top:12px}
     th{background:#eef2ff;text-align:left;padding:6px}td{padding:6px;border-bottom:1px solid #eee}.t{width:45%;margin-left:auto}.b td{font-weight:800;font-size:15px}`)
  }

  const convert = async () => {
    try {
      const { data } = await api.post(`quotations/${converting.id}/convert`, { payments: [] })
      toast.success(`Converted to order ${data.order_no}`)
      setConverting(null)
      qc.invalidateQueries({ queryKey: ['quotations'] })
      nav(`/orders/${data.id}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader title="Quotations" subtitle="Estimates for customers; convert to orders in one click" icon={<FileText className="h-5 w-5" />}
        actions={can('quotations.create') && <Link className="btn-primary" to="/pos?mode=quotation"><Plus className="h-4 w-4" />New quotation</Link>} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput className="flex-1" value={f.q} onChange={(q) => { setF({ ...f, q }); setPage(1) }} placeholder="Quotation no, name, mobile…" />
          <Select className="w-auto" placeholder="All statuses" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}
            options={['draft', 'sent', 'accepted', 'converted', 'expired'].map((s) => ({ value: s, label: label(s) }))} />
        </div>
        <DataTable rows={list.data?.data ?? []} loading={list.isFetching && !list.data} columns={[
          { key: 'quotation_no', header: 'Quotation', render: (r) => <b>{r.quotation_no}</b> },
          { key: 'created_at', header: 'Date', render: (r) => date(r.created_at) },
          { key: 'customer', header: 'Customer', render: (r) => r.customer?.name ?? r.customer_name ?? '—' },
          { key: 'valid_until', header: 'Valid until', render: (r) => date(r.valid_until) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'total', header: 'Total', align: 'right', render: (r) => money(r.total) },
          { key: 'a', header: '', align: 'right', render: (r) => (
            <div className="flex justify-end gap-1">
              <button className="btn-icon" title="Print" onClick={() => print(r.id)}><Printer className="h-4 w-4" /></button>
              {r.status !== 'converted' && can('quotations.update') && <Link className="btn-icon" title="Edit" to={`/pos?mode=quotation&quotation=${r.id}`}><Pencil className="h-4 w-4" /></Link>}
              {r.status !== 'converted' && can('quotations.convert') && <button className="btn-icon text-emerald-600" title="Convert to order" onClick={() => setConverting(r)}><ArrowRightCircle className="h-4 w-4" /></button>}
              {can('quotations.delete') && r.status !== 'converted' && <button className="btn-icon hover:!text-rose-600" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ) },
        ]} />
        {list.data && <Pagination page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={setPage} />}
      </Card>
      <Confirm open={!!converting} danger={false} title="Convert to order?" confirmText="Convert" onClose={() => setConverting(null)} onConfirm={convert}
        message="An order will be created with current prices (unpaid). A customer must be linked for unpaid orders; collect payment from the order page." />
      <Confirm open={!!deleting} title="Delete quotation?" confirmText="Delete" onClose={() => setDeleting(null)}
        onConfirm={async () => { try { await api.delete(`quotations/${deleting.id}`); setDeleting(null); list.refetch() } catch (e) { toast.error(errorMessage(e)) } }} />
    </div>
  )
}
